import { IncomingMessage, Server as HttpServer } from 'http';
import { parse } from 'querystring';
import WebSocket from 'ws';
import {
  ClientMessage,
  ClientRequest,
  ClientSubscription,
  RequestMethod,
  ServerEvent,
  ServerResponse
} from './interface';
import { Logger, LogLevel } from './logger';
import { Request } from './request';
import { Response } from './response';
import { RequestHandler, Router } from './router';
import { Subscriptions } from './subscription';
import { User, UserContext, Users } from './user';

export type ConnectionQuery = {
  clientId: string;
  reconnect?: boolean;
}
export type RequestMiddleware = (req: Request<any>, res: Response<any>) => void | Promise<void>;
export type ServerConfig = {
  logLevel?: LogLevel;
  keepAlive?: number;
  publishChanges?: boolean;
}

export class MetalEvent {
  private users: Users = {};
  private subscriptions: Subscriptions = new Subscriptions();
  private socket: WebSocket.Server;
  private router: Router = new Router();
  private middlewares: RequestMiddleware[] = [];

  constructor(server: HttpServer, private config: ServerConfig = {}) {
    if (config.logLevel) {
      Logger.config.level = config.logLevel;
    }

    this.socket = new WebSocket.Server({ server });
    this.socket.on('connection', (client: WebSocket, request: IncomingMessage) => {
      this.connect(client, request);
    });
    this.cleanup();
    Logger.info('Server created and ready.');
  }

  public use(middleware: RequestMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  public all<R, D>(path: string, handler: RequestHandler<R, D>): this {
    ['get', 'post', 'put', 'patch', 'delete', 'options'].forEach(method => {
      this.router.add(method as RequestMethod, path, handler);
    });
    return this;
  }

  public post<R, D>(path: string, handler: RequestHandler<R, D>): this {
    this.router.add('post', path, handler);
    return this;
  }

  public get<D>(path: string, handler: RequestHandler<null, D>): this {
    this.router.add('get', path, handler);
    return this;
  }

  public put<R, D>(path: string, handler: RequestHandler<R, D>): this {
    this.router.add('put', path, handler);
    return this;
  }

  public patch<R, D>(path: string, handler: RequestHandler<R, D>): this {
    this.router.add('patch', path, handler);
    return this;
  }

  public options(path: string, handler: RequestHandler<null, null>): this {
    this.router.add('options', path, handler);
    return this;
  }

  public delete<D>(path: string, handler: RequestHandler<null, D>): this {
    this.router.add('delete', path, handler);
    return this;
  }

  public emit<T>(event: ServerEvent<T>): void {
    this.subscriptions.emit(event);
  }

  protected connect(client: WebSocket, request: IncomingMessage) {
    const params: ConnectionQuery = parse(request.url.split('?')[1] || '') as any;
    const { clientId, reconnect } = params;
    const context: UserContext = { client, clientId };

    Logger.debug(`Connecting user: ${clientId}...`);

    let user;
    if (this.users[clientId]) {
      user = this.users[clientId];
      user.upgrade(context, reconnect);
    } else {
      user = new User(context);
      this.users[clientId] = user;
    }

    user.client.on('message', async (data: string) => {
      const message: ClientMessage<any> = JSON.parse(data);
      message.data.method = message.data.method.toLowerCase() as RequestMethod;

      if (message.type === 'request') {
        await this.response(user, message);
      } else if (message.type === 'subscription') {
        await this.subscription(user, message);
      }
    });
  }

  protected async response<R, D>(user: User, message: ClientMessage<R>): Promise<void> {
    const { uuid } = message;
    const { url, method, headers, data: body } = message.data as ClientRequest<R>;

    Logger.debug(`Initializing request ${uuid} [${method.toUpperCase()} ${url}]...`);

    try {
      const req = new Request<R>(this, url, method, headers);
      const res = new Response<D>(user, message);
      const { route, params, query } = this.router.match(method, url) || {};

      if (route) {
        Object.assign(req, { route, params, query, body });

        try {
          for (const middleware of this.middlewares) {
            await middleware(req, res);
          }

          await route.handler(req, res);

          if (this.config.publishChanges && ['post', 'put', 'patch', 'delete'].includes(req.method)) {
            this.emit<D>({
              path: req.path,
              type: method,
              data: res.body
            });
          }

          if (res.state !== 'sent') {
            res
              .status(200)
              .statusText('Success')
              .send();
          }

          Logger.info(`Request complete: ${uuid}.`);
        } catch (error) {
          Logger.error(`${error.message} - ${uuid}.`, error);
          if (res.state !== 'sent') {
            res
              .status(500)
              .statusText(error.message)
              .send();
          }
        }
      } else {
        res
          .status(404)
          .statusText('Not Found.')
          .send();
      }
    } catch (error) {
      Logger.error(`${error.message} - ${uuid}.`, error);
      const data: ServerResponse<D> = {
        status: 500,
        statusText: error.message
      }
      user.response<D>(uuid, data);
    }
  }

  protected async subscription(user: User, message: ClientMessage<any>) {
    const { uuid } = message;
    Logger.debug(`Initializing subscription: ${uuid}.`);
    const { url, method, headers, filters } = message.data as ClientSubscription;

    try {
      const req = new Request(this, url, method, headers);
      const res = new Response(user, message);
      const { route, params, query } = this.router.match('get', url) || {};

      if (route) {
        Object.assign(req, { route, params, query });

        try {
          for (const middleware of this.middlewares) {
            await middleware(req, res);
          }

          if (method === 'subscribe') {
            const sub = this.subscriptions.subscribe(req.path, user, filters);
            res
              .status(200)
              .statusText('Subscribed.')
              .send({ id: sub.id });

            Logger.info(`User subscribed: ${uuid}@${req.path}.`);
          } else if (method === 'unsubscribe') {
            this.subscriptions.unsubscribe(req.path, user, filters);
            res
              .status(200)
              .statusText('Unsubscribed.')
              .send();

            Logger.info(`User unsubscribed: ${uuid}@${req.path}.`);
          } else {
            res
              .status(400)
              .statusText('Bad request.')
              .send()
          }
        } catch (error) {
          Logger.error(`${error.message} - ${uuid}.`, error);
          if (res.state !== 'sent') {
            res
              .status(500)
              .statusText(error.message)
              .send();
          }
        }
      } else {
        res
          .status(404)
          .statusText('Not found.')
          .send();
      }
    } catch (error) {
      Logger.error(`${error.message} - ${uuid}.`, error);
      const data: ServerResponse<null> = {
        status: 500,
        statusText: error.message
      };
      user.response(uuid, data);
    }
  }

  protected cleanup() {
    setTimeout(() => {
      for (const [id, user] of Object.entries(this.users)) {
        if (user.disconnected) {
          const exp = user.disconnected.getTime() + (this.config.keepAlive || 6000);
          const now = new Date().getTime();

          if (exp <= now) {
            delete this.users[id];
            this.subscriptions.rem(user);
            Logger.debug(`Cleaned up user: ${id}.`);
          }
        }
      }

      this.cleanup();
    }, 500);
  }
}
