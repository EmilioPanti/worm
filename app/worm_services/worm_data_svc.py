import glob
import json
import yaml
from collections import defaultdict

from app.service.base_service import BaseService


class WormDataSvc(BaseService):

    def __init__(self, services):
        self.data_svc = services.get('data_svc')
        self.log = self.add_service('worm_data_svc', self)

    async def load_goals(self, directory):
        """
        Load all goal YML files into the database
        :param directory:
        :return: None
        """
        goals_already = await self.data_svc.get('goal', criteria=None)
        for filename in glob.iglob('%s/*.yml' % directory, recursive=True):
            for goal in self.strip_yml(filename):
                if (goal['name'] in [ga['name'] for ga in goals_already]) or (goal['id'] in [ga['goal_id'] for ga in goals_already]):
                    continue
                clauses = [dict(clause=k, type=i['type'], name=i['name'], value=i['value']) 
                            for k, v in goal['clauses'].items() for i in v]
                if (await self._check_clauses(goal['id'], goal['adversary'], clauses)):
                    await self.create_goal(goal['name'], goal['description'], goal['adversary'], clauses, goal['id'])
                    goals_already = await self.data_svc.get('goal', criteria=None)


    """ PERSIST """

    async def persist_goal(self, name, description, adversary_id, clauses, i):
        """
        Save a new goal from either the GUI or REST API. This writes a new YML file into 
        the plugins/worm/data/goals/ directory.
        :param name:
        :param description:
        :param adversary_id:
        :param clauses:
        :param i:
        :return: the ID of the created goal
        """
        c = defaultdict(list)
        for clause in clauses:
            info_clause = dict(type=clause['type'], name=clause['name'], value=clause['value'])
            c[clause['clause']].append(info_clause)
        file_path = 'plugins/worm/data/goals/%s.yml' % i
        with open(file_path, 'w+') as f:
            f.seek(0)
            f.write(yaml.dump(dict(id=i, name=name, description=description, adversary=adversary_id, clauses=dict(c))))
            f.truncate()
        return await self.create_goal(name, description, adversary_id, clauses, i)


    """ CREATE """

    async def create_worm(self, conf_operation, goal_id=None, stop_at_first_goals=None):
        """
        Save a new worm (and the related operation) to the database
        :param conf_operation:
        :param goal_id:
        :param stop_at_first_goals:
        :return: the database id
        """
        op_id = await self.data_svc.create_operation(**conf_operation)
        output = await self.data_svc.create('worm', dict( op_id=op_id, goal_id=goal_id, 
                            terminated=False, stop_at_first_goals=stop_at_first_goals))
        agents = await self.data_svc.get('core_agent',dict(host_group=conf_operation['group']))
        for a in agents:
            await self.create_worm_agent_map(worm_id=output, agent_id=a['id'], starter=1)
        return output

    async def create_worm_agent_map(self, worm_id, agent_id, starter=0, phase=0, cleanup=0, 
                                    finished_attack=False, status='potential_goal'):
        """
        Save a new worm-agent mapping to the database
        :param worm_id:
        :param agent_id:
        :param starter:
        :param phase:
        :param cleanup:
        :param finished_attack:
        :param status:
        :return: the database id
        """
        return await self.data_svc.create('worm_agent_map', dict(worm_id=worm_id, agent_id=agent_id,
                                starter=starter, phase=phase, cleanup=cleanup, 
                                finished_attack=finished_attack, status=status))

    async def create_goal(self, name, description, adversary_id, clauses, i):
        """
        Save a new goal to the database
        :param name:
        :param description:
        :param adversary_id:
        :param clauses:
        :param i:
        :return: the database id
        """
        identifier = await self.data_svc.create('goal', dict(goal_id=i, adversary_id=adversary_id,
                                                name=name.lower(), description=description))
        for c in clauses:
            data = (dict(goal_id=identifier, clause=c['clause'], type_condition=c['type'], 
                    name=c['name'], val=c['value']))
            await self.data_svc.create('goal_map', data)
        return identifier


    """ VIEW """

    async def explode_worm(self, criteria=None):
        """
        Get all - or a filtered list of - worm-operations, built out with all sub-objects
        :param criteria:
        :return: a list of dictionary results
        """
        worms = await self.data_svc.get('worm', criteria)
        for w in worms:
            w['op'] = (await self.data_svc.explode_operation(dict(id=w['op_id'])))[0]
            w['op']['host_group'] = await self._get_worm_agents(w)
            #to retrieve the actual starting group-name -- even if the worm-operation agents have changed group
            op_info = (await self.data_svc.get('core_operation', dict(id=w['op_id'])))[0]
            w['starting_group'] = op_info['host_group']
            w['goal'] = None
            if w['goal_id'] is not None:
                w['goal'] = (await self.explode_goal(dict(id=w['goal_id'])))[0]
        return worms
    
    async def explode_goal(self, criteria=None):
        """
        Get all - or a filtered list of - goals, built out with all sub-objects
        :param criteria:
        :return: a list of dictionary results
        """
        goals = await self.data_svc.get('goal', criteria)
        for g in goals:
            clauses = defaultdict(list)
            for c in await self.data_svc.get('goal_map', dict(goal_id=g['id'])):
                info = dict(type=c['type_condition'], name=c['name'], value=c['val'])
                clauses[c['clause']].append(info)
            g['clauses'] = dict(clauses)
        return goals


    """ PRIVATE """

    async def _check_clauses(self, goal_id, adversary_id, clauses):
        """
        Check that the clauses are compatible with the adversary to whom they refer.
        :param goal_id:
        :param adversary_id:
        :param clauses:
        :return: boolean
        """
        adversaries = await self.data_svc.explode_adversaries(dict(adversary_id=adversary_id))
        if not adversaries:
            self.log.debug('Impossible to load goal %s: adversary %s does not exist' % (goal_id, adversary_id))
            return False
        adversary = adversaries[0]
        agent_properties = ['paw', 'architecture', 'platform', 'location', 'pid', 'ppid', 'father']
        adv_host_facts = set()
        for k, abilities in adversary['phases'].items():
            for p in [ab['parser'] for ab in abilities]:
                for fact in [f for f in p if f['property'].startswith('host')]:
                    adv_host_facts.add(fact['property'])
        for c in clauses:
            if c['type'] == 'host-fact':
                if c['name'] not in adv_host_facts:
                    self.log.debug('Impossible to load goal %s: host-fact %s is not collected in adversary %s' % (goal_id, c['name'], adversary_id))
                    return False
            elif c['type'] == 'property':
                if c['name'] not in agent_properties:
                    self.log.debug('Impossible to load goal %s: property %s is not an agent property' % (goal_id, c['name']))
                    return False
            else:
                self.log.debug('Impossible to load goal %s: %s is not an expected type (allowed types: host-fact and property)' % (goal_id, c['type']))
                return False
        return True


    async def _get_worm_agents(self, worm):
        """
        Retrieve information on participating agents in a worm-operation. The recovery of this 
        information takes place differently, depending on whether the worm-operation is finished or not.
        :param worm:
        :return: a list of dict
        """
        map_agents = await self.data_svc.get('worm_agent_map', dict(worm_id=worm['id']))
        if (worm['op']['state'] == 'finished'):
            '''
            After an worm-operation is finished, it is possible that the agents who participated have changed groups. 
            In this case, I retrieve information on the participating agents via the "worm_agent_map" table 
            instead of from "worm['op']['host_group']" - which may no longer contain some agents wich participated 
            in the worm-operation -
            '''
            worm_agents = []
            for ma in map_agents:
                agent = (await self.data_svc.explode_agents(criteria=dict(id=ma['agent_id'])))[0]
                if agent:
                    agent['starter'] = ma['starter']
                    agent['phase'] = ma['phase']
                    agent['cleanup'] = ma['cleanup']
                    agent['finished_attack'] = ma['finished_attack']
                    agent['status'] = ma['status']
                    worm_agents.append(agent)
            return worm_agents
        else:
            for a in worm['op']['host_group']:
                map_agent = next((ma for ma in map_agents if ma['agent_id'] == a['id']), 
                            dict(starter=False, phase=0, cleanup=0, finished_attack=False, status='potential_goal'))
                a['starter'] = map_agent['starter']
                a['phase'] = map_agent['phase']
                a['cleanup'] = map_agent['cleanup']
                a['finished_attack'] = map_agent['finished_attack']
                a['status'] = map_agent['status']
            return worm['op']['host_group']