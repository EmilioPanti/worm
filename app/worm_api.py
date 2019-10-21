import asyncio

from aiohttp import web
from aiohttp_jinja2 import template


class WormApi:

    def __init__(self, services):
        self.data_svc = services.get('data_svc')
        self.auth_svc = services.get('auth_svc')
        self.plugin_svc = services.get('plugin_svc')
        self.worm_data_svc = services.get('worm_data_svc')
        self.worm_operation_svc = services.get('worm_operation_svc')
        self.loop = asyncio.get_event_loop()
        
        
    @template('worm.html')
    async def landing(self, request):
        await self.auth_svc.check_permissions(request)
        hosts = await self.data_svc.explode_agents()
        groups = list(set(([h['host_group'] for h in hosts])))
        adversaries = await self.data_svc.explode_adversaries()
        worms = await self.worm_data_svc.explode_worm()
        sources = await self.data_svc.explode_sources()
        planners = [p for p in await self.data_svc.explode_planners() 
                    if p['module'].startswith('plugins.worm.app.worm_planners')]
        plugins = [dict(name=getattr(p, 'name'), address=getattr(p, 'address')) for p in self.plugin_svc.get_plugins()]
        goals = await self.worm_data_svc.explode_goal()
        return dict(agents=hosts, groups=groups, adversaries=adversaries, worms=worms, 
                    sources=sources, planners=planners, plugins=plugins, goals=goals)


    async def rest_full(self, request):
        base = await self.rest_core(request)
        base[0]['op']['abilities'] = await self.data_svc.explode_abilities()
        return web.json_response(base)

    async def rest_api(self, request):
        base = await self.rest_core(request)
        return web.json_response(base)

    async def rest_core(self, request):
        await self.auth_svc.check_permissions(request)
        data = dict(await request.json())
        index = data.pop('index')
        
        if request.method == 'PUT' and index == 'worm':
            conf_operation=dict(
                name=data.pop('name'),
                group=data.pop('group'),
                adversary_id=data.pop('adversary_id'),
                planner=data.pop('planner', None),
                jitter=data.pop('jitter', "2/8"),
                sources=data.pop('sources', None),
                state=data.pop('state', 'running'),
                allow_untrusted = data.pop('allow_untrusted', False),
                autonomous = data.pop('autonomous', True)
            )
            data['conf_operation'] = conf_operation

        options = dict(
            PUT=dict(
                worm=lambda d: self.worm_data_svc.create_worm(**d),
                goal=lambda d: self.worm_data_svc.persist_goal(**d)
            ),
            POST=dict(
                worm=lambda d: self.worm_data_svc.explode_worm(criteria=d),
                goal=lambda d: self.worm_data_svc.explode_goal(criteria=d),
                core_result=lambda d: self.data_svc.explode_results(criteria=d),
                core_adversary=lambda d: self.worm_data_svc.explode_adversaries_and_facts(criteria=d),
                worm_report=lambda d: self.worm_operation_svc.generate_worm_report(**d),
                relate_worm_goal=lambda d: self.worm_operation_svc.relate_worm_goal(**d)
            )
        )
        output = await options[request.method][index](data)
        if request.method == 'PUT' and index == 'worm':
            self.loop.create_task(self.worm_operation_svc.run_worm_operation(output))
        return output

    async def rest_stop(self, request):
        await self.auth_svc.check_permissions(request)
        data = dict(await request.json())
        await self.data_svc.update('worm', key='id', value=data['id'], data=dict(terminated=1))
        return web.Response()
    
    async def rest_split_agents(self, request):
        await self.auth_svc.check_permissions(request)
        data = dict(await request.json())
        for agent_id in data['goal_agents']:
            await self.data_svc.update('core_agent', key='id', value=agent_id, data=dict(host_group=data['goal_group']))
        for agent_id in data['no_goal_agents']:
            await self.data_svc.update('core_agent', key='id', value=agent_id, data=dict(host_group=data['no_goal_group']))
        return web.Response()