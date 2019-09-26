from plugins.worm.app.worm_services.worm_data_svc import WormDataSvc
from plugins.worm.app.worm_services.worm_operation_svc import WormOperationSvc
from plugins.worm.app.worm_api import WormApi

name = 'Worm'
description = 'Adds a REST API for worm-attacks mode, along with GUI configuration'
address = '/plugin/worm/gui'


async def initialize(app, services):
    await services['data_svc'].load_data(schema='plugins/%s/worm.sql' % name.lower())
    worm_data_svc = WormDataSvc(services=services)
    services['worm_data_svc'] = worm_data_svc
    worm_operation_svc = WormOperationSvc(services=services)
    services['worm_operation_svc'] = worm_operation_svc
    worm_api = WormApi(services)
    app.router.add_static('/worm', 'plugins/worm/static/', append_version=True)
    app.router.add_route('GET', '/plugin/worm/gui', worm_api.landing)
    app.router.add_route('*', '/plugin/worm/full', worm_api.rest_full)
    app.router.add_route('*', '/plugin/worm/rest', worm_api.rest_api)
    app.router.add_route('PUT', '/plugin/worm/stop', worm_api.rest_stop)
    app.router.add_route('PUT', '/plugin/worm/agents/split', worm_api.rest_split_agents)
    await services.get('data_svc').load_data(directory='plugins/worm/data')
    await worm_data_svc.load_goals(directory='plugins/worm/data/goals')
