const { Container } = require('typedi')
const {
    HostServiceToken,
    MockServiceToken,
    RuleServiceToken,
    ProfileConfigServiceToken
} = require("lib-zan-proxy/lib/service")
const http = require("http")
const koa = require("koa")
const path = require("path")
const koaBody = require("koa-body")
const koaQs = require("koa-qs")
const staticServe = require("koa-static")
// const mount = require('koa-mount')
const SocketIO = require("socket.io")
// require('uws')
const cookieParser = require("cookie")
const router = require("./router")

module.exports = class UiServer {

    constructor() {
        // 初始化koa
        this.app = new koa();
        // query string
        koaQs(this.app);
        // body解析
        this.app.use(koaBody({ multipart: true }));
        // 路由
        this.app.use(router());
        // 静态资源服务
        this.app.use(staticServe(path.join(__dirname, '../static')));
        this.server = http.createServer(this.app.callback());
        // socketio
        this.io = new SocketIO(this.server);

        this.hostService = Container.get(HostServiceToken)
        this.ruleService = Container.get(RuleServiceToken)
        this.mockDataService = Container.get(MockServiceToken)
        this.profileConfigService = Container.get(ProfileConfigServiceToken)
        // 初始化socket io
        // this._initTraffic();
        this._initManger();
        // this._initWsMock();
        // this._initBreakpoint();
    }

    async listen(port) {
        this.server.listen(port)
    }

    // http流量监控界面
    _initTraffic() {
        this.httpTraficMonitorNS = this.io.of('/httptrafic');
        // 客户端发起连接请求
        this.httpTraficMonitorNS.on('connection', client => {

            let userId = this._getUserId(client);
            client.join(userId, err => {
            });

            this.httpTrafficService.incMonitor(userId);
            // 推送过滤器，状态
            let state = this.httpTrafficService.getStatus(userId);
            client.emit('state', state);
            let filter = this.httpTrafficService.getFilter(userId);
            client.emit('filter', filter);
            client.emit('clear');
            client.on('disconnect', () => {
                this.httpTrafficService.decMonitor(userId);
            });
        });

        // 监听logRespository事件
        this.httpTrafficService.on('traffic', (userId, rows) => {
            this.httpTraficMonitorNS.to(userId).emit('rows', rows);
        });
        // 过滤器改变
        this.httpTrafficService.on('filter', (userId, filter) => {
            this.httpTraficMonitorNS.to(userId).emit('filter', filter);
        });
        // 状态改变
        this.httpTrafficService.on('state-change', (userId, state) => {
            this.httpTraficMonitorNS.to(userId).emit('state', state);
        });
        // 清空
        this.httpTrafficService.on('clear', (userId) => {
            this.httpTraficMonitorNS.to(userId).emit('clear');
            let state = this.httpTrafficService.getStatus(userId);
            this.httpTraficMonitorNS.to(userId).emit('state', state);
        });
    }

    // 管理界面 使用的功能
    _initManger() {
        this.managerNS = this.io.of('/manager');

        // 注册通知
        this.managerNS.on('connection', async client => {
            // 监听内部状态的客户端,这些客户端获取当前生效的host、rule
            let userId = this._getUserId(client);
            client.join(userId, err => {
            });
            // 推送最新数据
            // proxy配置
            // let config = await this.configureService.getConfigure();
            // client.emit('configure', config);
            // // 个人配置
            let profile = await this.profileConfigService.getProfile();
            client.emit('profile', profile);
            // let mappedClientIps = await this.profileConfigService.getClientIpsMappedToUserId(userId);
            // client.emit('mappedClientIps', mappedClientIps);
            // host文件列表
            let hostFileList = await this.hostService.getHostFileList();
            client.emit('hostfilelist', hostFileList);
            // 规则列表
            let ruleFileList = await this.ruleService.getRuleFileList();
            client.emit('rulefilelist', ruleFileList);
            // // 数据文件列表
            let dataList = await this.mockDataService.getMockDataList();
            client.emit('datalist', dataList);
        });
        // proxy配置信息
        // this.configureService.on("data-change", (userId, configure) => {
        //     this.managerNS.to(userId).emit('configure', configure);
        // });
        // 个人配置信息
        this.profileConfigService.on("data-change-profile", (profile) => {
            this.managerNS.to('root').emit('profile', profile);
        });
        // this.profileConfigService.on("data-change-clientIpUserMap", (userId, clientIpList) => {
        //     this.managerNS.to(userId).emit('mappedClientIps', clientIpList);
        // });
        // host文件变化
        this.hostService.on("data-change", (hostFilelist) => {
            this.managerNS.to('root').emit('hostfilelist', hostFilelist);
        });
        // 规则文件列表
        this.ruleService.on("data-change", (ruleFilelist) => {
            this.managerNS.to('root').emit('rulefilelist', ruleFilelist);
        });
        // // mock文件列表
        this.mockDataService.on("data-change", (userId, dataFilelist) => {
            this.managerNS.to('root').emit('datalist', dataFilelist);
        });
        // // 过滤器
        // this.filterService.on("data-change", (userId, filters) => {
        //     this.managerNS.to(userId).emit('filters', filters);
        // });
    }

    // ws mock 相关函数
    _initWsMock() {
        this.wsmockNS = this.io.of('/wsmock');

        this.wsmockNS.on('connection', async debugClient => {

            let userId = this._getUserId(debugClient);
            debugClient.join(userId, err => {
            });
            // 将websocket的id返回给浏览器
            let connectionId = await this.wsMockService.newConnectionId(userId);
            // 向客户端 发送 连接id
            debugClient.emit('connection-id', connectionId);
            // 向客户端发送当前所有的session
            debugClient.emit('sessions', await this.wsMockService.getSessions(userId));

            // 用户关闭ws界面
            debugClient.on('disconnect', _ => {
                this.wsMockService.connectionClosed(userId, connectionId);
            });
        });

        this.wsMockService.on("page-connected", (userId, sessionId) => {
            this.wsmockNS.to(userId).emit('page-connected', sessionId);
        });
        this.wsMockService.on("page-msg", (userId, sessionId, data) => {
            this.wsmockNS.to(userId).emit('page-msg', sessionId, data);
        });
        this.wsMockService.on("page-closed", (userId, sessionId) => {
            this.wsmockNS.to(userId).emit('page-closed', sessionId);
        });
        this.wsMockService.on("sessions", (userId, sessions) => {
            this.wsmockNS.to(userId).emit('sessions', sessions);
        });
    }

    /**
     * break point
     * @param socketIOConn
     * @returns {*|string}
     * @private
     */
    _initBreakpoint() {
        this.breakpointNS = this.io.of('/breakpoint');
        this.breakpointNS.on('connection', client => {
            // 获取用户id，将连接加入到用户组
            let userId = this._getUserId(client);
            client.join(userId, err => {
            });

            let connectionId = this.breakpointService.newConnectionId(userId);
            client.emit('connection-id', connectionId);

            // 用户关闭断点界面  关闭该链接相关的所有断点
            client.on('disconnect', _ => {
                this.breakpointService.connectionClosed(userId, connectionId);
            });
            // 发送当前所有的断点
            client.emit('breakpoints', this.breakpointService.getUserBreakPoints(userId));
        });

        this.breakpointService.on('breakpoint-save', (userId, breakpoint) => {
            this.breakpointNS.to(userId).emit('breakpoint-save', breakpoint);
        });
        this.breakpointService.on('breakpoint-delete', (userId, breakpointId) => {
            this.breakpointNS.to(userId).emit('breakpoint-delete', breakpointId);
        });

        this.breakpointService.on('instance-add', (userId, breakpointId, instance) => {
            this.breakpointNS.to(userId).emit('instance-add', breakpointId, instance);
        });

        this.breakpointService.on('instance-delete', (userId, breakpointId, instance) => {
            this.breakpointNS.to(userId).emit('instance-delete', breakpointId, instance);
        });

        this.breakpointService.on('instance-set-request-content', (userId, breakpointId, instanceId, content) => {
            this.breakpointNS.to(userId).emit('client-request', breakpointId, instanceId, content);
        });
        this.breakpointService.on('instance-set-server-response', (userId, breakpointId, instanceId, content) => {
            this.breakpointNS.to(userId).emit('server-response', breakpointId, instanceId, content);
        });
        this.breakpointService.on('instance-sended-to-client', (userId, breakpointId, instanceId) => {
            this.breakpointNS.to(userId).emit('instance-end', breakpointId, instanceId);
        });
    }

    // 通用函数，获取web socket连接中的用户id
    _getUserId(socketIOConn) {
        let cookies = cookieParser.parse(socketIOConn.request.headers.cookie || "");
        return cookies['userId'] || 'root';
    }
};
