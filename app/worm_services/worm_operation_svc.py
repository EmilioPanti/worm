import asyncio
import json
import os
import traceback
from importlib import import_module

from app.service.base_service import BaseService


class WormOperationSvc(BaseService):

    def __init__(self, services):
        self.data_svc = services.get('data_svc')
        self.operation_svc = services.get('operation_svc')
        self.parsing_svc = services.get('parsing_svc')
        self.worm_data_svc = services.get('worm_data_svc')
        self.log = self.add_service('worm_operation_svc', self)
        

    async def close_worm_operation(self, worm):
        """
        Perform all close actions for a worm-operation
        :param worm:
        :return: None
        """
        self.log.debug('Worm-operation complete: %s' % worm['id'])
        if not worm['terminated']:
            await self.data_svc.update('worm', key='id', value=worm['id'], data=dict(terminated=1))
        update = dict(finish=self.get_current_timestamp(), state='finished')
        await self.data_svc.update('core_operation', key='id', value=worm['op']['id'], data=update)
        report = await self.generate_worm_report(worm['id'])
        await self._write_report(report)

    async def run_worm_operation(self, worm_id):
        """
        Run a new worm-operation
        :param worm_id:
        :return: None
        """
        self.log.debug('Starting worm-operation: %s' % worm_id)
        worm = (await self.worm_data_svc.explode_worm(dict(id=worm_id)))[0]
        try:
            planner = await self._get_planning_module(worm['op']['planner'])
            clauses_met_map = dict()  #to keep track of the clauses fulfilled by each agent
            while(not await self._check_if_finished(worm)):
                await self.parsing_svc.parse_facts(worm['op'])
                worm = (await self.worm_data_svc.explode_worm(dict(id=worm_id)))[0]
                ready_agents = await self._get_ready_agents(worm)
                await self._check_new_agents(worm)
                if ready_agents:
                    if worm['goal_id'] is not None:
                        goal_achieved, clauses_met_map = await self._check_goal_agents(worm, ready_agents, clauses_met_map)
                        if (goal_achieved) and (worm['stop_at_first_goals']) and (not worm['terminated']):
                            await self.data_svc.update('worm', key='id', value=worm['id'], 
                                                        data=dict(terminated=1))
                            worm['terminated'] = 1  #without re-calling explode_worm
                    await self._generate_new_links(worm, ready_agents, planner)
                else:
                    await asyncio.sleep(3)
                worm = (await self.worm_data_svc.explode_worm(dict(id=worm_id)))[0]
            await self.close_worm_operation(worm)
        except Exception:
            traceback.print_exc()

    async def generate_worm_report(self, worm_id):
        """
        Create a new worm-operation report
        :param worm_id:
        :return: a JSON report
        """
        worm = (await self.worm_data_svc.explode_worm(dict(id=worm_id)))[0]
        report = await self.operation_svc.generate_operation_report(worm['op']['id'])
        report['worm_id'] = worm['id']
        report['op_id'] = report.pop('id')
        report['host_group'] = worm['op']['host_group']
        report['goal'] = worm['goal']
        report['starting_group'] = worm['starting_group']
        report['stop_at_first_goals'] = worm['stop_at_first_goals']
        return report

    async def relate_worm_goal(self, worm_id, goal_id):
        """
        Relates the results of a worm-operation to a different goal 
        from that of the worm-operation
        :param worm_id:
        :param goal_id:
        :return: a list of dict
        """
        worm = (await self.worm_data_svc.explode_worm(dict(id=worm_id)))[0]
        goal = (await self.worm_data_svc.explode_goal(dict(id=goal_id)))[0]
        for agent in worm['op']['host_group']:
            if (await self._total_check_goal_agent(agent, goal, worm)):
                agent['status'] = 'goal_agent'
            else:
                agent['status'] = 'no_goal_agent'
        return worm['op']['host_group']


    """ PRIVATE """

    @staticmethod
    async def _check_if_finished(worm):
        """
        Check if the worm-operation is finished
        :param worm:
        :return: a boolean
        """
        agents = worm['op']['host_group']
        if not worm['op']['allow_untrusted']:
            agents = [a for a in agents if a['trusted']]
        return next((False for a in agents if not a['finished_attack']),True)

    async def _get_ready_agents(self, worm):
        """
        Get agents ready to execute a new phase
        :param worm:
        :return: a list of dictionary results
        """
        operation = worm['op']
        ready_agents = []
        for member in [m for m in operation['host_group'] if not m['finished_attack']]:
            if (not member['trusted']) and (not operation['allow_untrusted']):
                continue
            if next((False for lnk in operation['chain'] if lnk['paw'] == member['paw'] and not lnk['finish']
                    and not lnk['status'] == self.LinkState.DISCARD.value), True):
                ready_agents.append(member)
        return ready_agents

    async def _check_new_agents(self, worm):
        """
        Check for new agents and map them with the relevant worm_id
        :param worm:
        :return: None
        """
        already_present = await self.data_svc.get('worm_agent_map', dict(worm_id=worm['id']))
        for member in worm['op']['host_group']:
            if next((False for ap in already_present if ap['agent_id'] == member['id']),True):
                await self.worm_data_svc.create_worm_agent_map(worm_id=worm['id'], agent_id=member['id'])

    async def _check_goal_agents(self, worm, agents_to_check, clauses_met_map):
        """
        Check for goal agents
        :param worm:
        :param agents_to_check:
        :param clauses_met_map:
        :return: a boolean, a list of dict
        """
        goal_achieved = False
        for agent in [a for a in agents_to_check if a['status'] == 'potential_goal']:
            clauses_met_by_agent = []
            if agent['phase'] == 0:
                clauses_met_by_agent = await self._check_goal_properties(worm, agent)
            else:
                clauses_met_by_agent = await self._check_goal_host_facts(worm, agent, clauses_met_map)
            clauses_already_met = clauses_met_map.pop(agent['id'], [])
            tot_clauses_met = list(set(clauses_met_by_agent + clauses_already_met)) 
            #if goal_agent
            if len(tot_clauses_met) == len(worm['goal']['clauses']):
                agent_map_id = (await self.data_svc.get('worm_agent_map', 
                            dict(worm_id=worm['id'], agent_id=agent['id'])))[0]['id']
                await self.data_svc.update('worm_agent_map', key='id', value=agent_map_id, 
                                        data=dict(status="goal_agent"))
                goal_achieved = True
            else:
                clauses_met_map[agent['id']] = tot_clauses_met
        return goal_achieved, clauses_met_map

    async def _check_goal_properties(self, worm, agent):
        """
        Checks and returns the clauses satisfied by the agent properties
        :param worm:
        :param agent:
        :return: a list
        """
        goal = worm['goal']
        clauses_met = []
        for clause, conditions in goal['clauses'].items():
            conditions_not_met = 0
            for cond in [c for c in conditions if c['type'] == 'property']:
                if agent[cond['name']] == cond['value']:
                    clauses_met.append(clause)
                    break
                else:
                    conditions_not_met = conditions_not_met + 1
            #if surely it can never be a goal-agent due its properties
            if conditions_not_met == len(conditions):
                agent_map_id = (await self.data_svc.get('worm_agent_map', 
                                dict(worm_id=worm['id'], agent_id=agent['id'])))[0]['id']
                await self.data_svc.update('worm_agent_map', key='id', value=agent_map_id, 
                                            data=dict(status="no_goal_agent"))
                return []
        return clauses_met

    async def _check_goal_host_facts(self, worm, agent, clauses_met_map):
        """
        Checks and returns the clauses satisfied by the host-facts collected by agent
        :param worm:
        :param agent:
        :param clauses_met_map:
        :return: a list
        """
        goal = worm['goal']
        clauses_met = []
        clauses_already_met = clauses_met_map.get(agent['id'], [])
        agent_facts = await self._get_agent_facts(worm, agent['paw'])
        for clause, conditions in goal['clauses'].items():
            if clause in clauses_already_met:
                continue
            for cond in [c for c in conditions if c['type'] == 'host-fact']:
                if next((True for f in agent_facts if (f['property'] == cond['name']) and (f['value'] == cond['value'])), False):
                    clauses_met.append(clause)
                    break
        return clauses_met

    async def _get_agent_facts(self, worm, paw):
        """
        Collect a list of this agent's facts
        :param worm:
        :param paw:
        :return: a list of dict
        """
        agent_facts = []
        for link in [l for l in worm['op']['chain'] if l['paw'] == paw]:
            facts = await self.data_svc.get('core_fact', criteria=dict(link_id=link['id']))
            agent_facts = agent_facts + facts
        return agent_facts

    async def _get_planning_module(self, planner_id):
        """
        Retrieve the planner module
        :param planner_id:
        :return: planner module
        """
        chosen_planner = await self.data_svc.explode_planners(dict(id=planner_id))
        planning_module = import_module(chosen_planner[0]['module'])
        return getattr(planning_module, 'LogicalPlanner')(self.get_service('planning_svc'),
                                                          **chosen_planner[0]['params'])

    async def _generate_new_links(self, worm, ready_agents, planner):
        """
        Generates links for agents ready to execute new ones
        :param worm:
        :param ready_agents:
        :param planner:
        :return: None
        """
        tot_phases = len(worm['op']['adversary']['phases'])
        for a in ready_agents:
            agent_map_id = (await self.data_svc.get('worm_agent_map', 
                            dict(worm_id=worm['id'], agent_id=a['id'])))[0]['id']
            info_str = 'Worm-operation %s (%s) agent %s' % (worm['id'], worm['op']['name'], a['paw'])
            if (a['cleanup']) or ((a['phase'] == 0) and (worm['terminated'])):
                await self.data_svc.update('worm_agent_map', key='id', value=agent_map_id, 
                                                    data=dict(finished_attack=1))
                self.log.debug('%s: attack terminated, phase reached %s' % (info_str, a['phase']))
            elif ((a['phase'] == tot_phases) or (worm['terminated'])):
                self.log.debug('%s: phase %s completed' % (info_str, a['phase']))
                self.log.debug('%s: cleanup phase started' % info_str)
                await planner.create_cleanup_links(worm, a)
                await self.data_svc.update('worm_agent_map', key='id', value=agent_map_id, 
                                                    data=dict(cleanup=1))
            else:
                if a['phase'] > 0:
                    self.log.debug('%s: phase %s completed' % (info_str, a['phase']))
                a['phase'] = a['phase'] + 1
                self.log.debug('%s: phase %s started' % (info_str, a['phase']))
                await planner.create_links(worm, a)
                await self.data_svc.update('worm_agent_map', key='id', value=agent_map_id, 
                                                    data=dict(phase=a['phase']))
    
    @staticmethod
    async def _write_report(report):
        with open(os.path.join('logs', 'worm_operation_report_' + report['name'] + '.json'), 'w') as f:
            f.write(json.dumps(report, indent=4))

    async def _total_check_goal_agent(self, agent, goal, worm):
        """
        Checks if an agent which participated in a worm-operation satisfies another
        different goal from that of the worm-operation
        :param agent:
        :param goal:
        :param worm:
        :return: a boolean
        """
        clauses_met = 0
        agent_facts = await self._get_agent_facts(worm, agent['paw'])
        for clause, conditions in goal['clauses'].items():
            for c in conditions:
                if c['type'] == 'host-fact':
                    if next((True for f in agent_facts if (f['property'] == c['name']) and (f['value'] == c['value'])), False):
                        clauses_met = clauses_met + 1
                        break
                else:
                    if agent[c['name']] == c['value']:
                        clauses_met = clauses_met + 1
                        break
        return (clauses_met == len(goal['clauses']))