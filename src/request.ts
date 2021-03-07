import { RequestHeaders, RequestMethod } from './interface';
import { Route, RouteParams, RouteQuery } from './router';
import { MetalEvent } from './server';

export class Request<T> {
  public route: Route<any, any>;
  public query: RouteQuery = {};
  public params: RouteParams = {};
  public body: T = null;

  get path(): string {
    return this.originalUrl.split('?')[0];
  }

  constructor(public app: MetalEvent,
              public originalUrl: string,
              public method: RequestMethod,
              public headers: RequestHeaders) {}
}
