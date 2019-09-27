from datetime import datetime


class LogicalPlanner:

    def __init__(self, planning_svc):
        self.planning_svc = planning_svc
        self.data_svc = planning_svc.get_service('data_svc')


    async def create_links(self, worm, ready_agent):
        """
        For an worm-operation, phase and agent combination, determine which potential links can be executed
        :param worm:
        :param ready_agent:
        :return: None
        """
        operation = worm['op']
        phase_abilities = [i for p, v in operation['adversary']['phases'].items() if p == ready_agent['phase'] for i in v]
        phase_abilities = sorted(phase_abilities, key=lambda i: i['id'])

        link_status = await self.planning_svc._default_link_status(operation)
        links = []
        for a in await self.planning_svc.capable_agent_abilities(phase_abilities, ready_agent):
            links.append(
                dict(op_id=operation['id'], paw=ready_agent['paw'], ability=a['id'], command=a['test'], score=0,
                     status=link_status, decide=datetime.now(), executor=a['executor'],
                     jitter=self.planning_svc.jitter(operation['jitter']), adversary_map_id=a['adversary_map_id']))
        links[:] = await self.planning_svc._trim_links(operation, links, ready_agent)
        for l in await self.planning_svc._sort_links(links):
            l.pop('rewards', [])
            l.pop('adversary_map_id')
            await self.data_svc.create('core_chain', l)

    async def create_cleanup_links(self, worm, ready_agent):
        """
        For a given worm-operation and a given agent, create a link for every cleanup action
        on every executed ability by agent
        :param worm:
        :param ready_agent:
        :return: None
        """
        link_status = await self.planning_svc._default_link_status(worm['op'])
        links = []
        for link in await self.data_svc.explode_chain(criteria=dict(paw=ready_agent['paw'], op_id=worm['op']['id'])):
            ability = (await self.data_svc.explode_abilities(criteria=dict(id=link['ability'])))[0]
            if ability['cleanup'] and link['status'] >= 0:
                links.append(dict(op_id=worm['op']['id'], paw=ready_agent['paw'], ability=ability['id'], 
                                    cleanup=1, command=ability['cleanup'], executor=ability['executor'], 
                                    score=0, decide=datetime.now(), jitter=0, status=link_status))
        links[:] = await self.planning_svc._trim_links(worm['op'], links, ready_agent)
        for link in reversed(links):
            link.pop('rewards', [])
            await self.data_svc.create('core_chain', link)
