import { parse } from 'querystring';
import UrlPattern from 'url-pattern';
import { RequestMethod } from './interface';
import { Logger } from './logger';
import { Request } from './request';
import { Response } from './response';

export type RouteParams = {
  [key: string]: string | number | boolean;
}
export type RouteQuery = {
  [key: string]: string | number | boolean | object | any[];
}

export type RequestRoute<R, D> = {
  route: Route<R, D>;
  params: RouteParams;
  query: RouteQuery;
};
export type RequestHandler<R, D> = (req: Request<R>, res: Response<D>) => void | Promise<void>;

export class Router {
  private _get: Route<any, any>[] = [];
  private _post: Route<any, any>[] = [];
  private _put: Route<any, any>[] = [];
  private _patch: Route<any, any>[] = [];
  private _delete: Route<any, any>[] = [];
  private _options: Route<any, any>[] = [];

  public add<R, D>(method: RequestMethod, path: string, handler: RequestHandler<R, D>): this {
    const routes: Route<any, any>[] = this[`_${method}`];
    if (routes) {
      routes.push(new Route(method, path, handler));
    } else {
      throw new Error('Invalid method.');
    }

    return this;
  }

  public get<R, D>(method: RequestMethod, path: string): Route<R, D> {
    const routes: Route<any, any>[] = this[`_${method}`];
    if (routes) {
      const targets = routes.filter(route => route.path === path);
      if (targets.length) {
        return targets[1];
      }
    } else {
      throw new Error('Invalid method.');
    }
  }

  public rem(method: RequestMethod, path: string): this {
    const routes: Route<any, any>[] = this[`_${method}`];
    if (routes) {
      routes.forEach(route => {
        if (route.path === path) {
          routes.splice(routes.indexOf(route), 1);
        }
      });
    } else {
      throw new Error('Invalid method.');
    }

    return this;
  }

  public match<R, D>(method: RequestMethod, url: string): RequestRoute<R, D> {
    const [path, query] = url.split('?');
    const routes: Route<R, D>[] = this[`_${method}`];
    if (routes) {
      const match = routes.filter(route => route.match(path));
      if (match.length) {
        return {
          route: match[0],
          params: match[0].match(path),
          query: query ? parse(query) : {},
        }
      }
    } else {
      throw new Error('Invalid method.');
    }
  }
}

export class Route<R, D> {
  private pattern: UrlPattern;

  constructor(public method: string, public path: string, public handler: RequestHandler<R, D>) {
    if (!path.startsWith('/')) {
      this.path = `/${path}`;
    }

    this.pattern = new UrlPattern(this.path);
    Logger.info(`Added route: [${method.toUpperCase()} ${this.path}].`);
  }

  public match(url: string) {
    return this.pattern.match(url);
  }
}
