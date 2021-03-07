import { v4 as uuid } from 'uuid';
import { match, QueryFilter } from './filter';
import { ServerEvent } from './interface';
import { Logger } from './logger';
import { User } from './user';

export type Subscribers = Subscription[];

export class Subscriptions {
  private paths: {
    [path: string]: Subscription[];
  } = {}

  public subscribe(path: string, user: User, filters: QueryFilter = {}): Subscription {
    if (!this.paths[path]) {
      this.paths[path] = [];
    }

    const existing = this.paths[path].filter(sub => {
      return sub.user === user && JSON.stringify(filters) === JSON.stringify(sub.filters);
    });

    if (existing.length) {
      return existing[0];
    } else {
      const sub = new Subscription(user, path, filters);
      this.paths[path].push(sub);
      return sub;
    }
  }

  public unsubscribe(path: string, user: User, filters: QueryFilter = {}): void {
    if (!this.paths[path]) {
      return;
    }

    const subscribers = this.paths[path];
    subscribers.forEach(sub => {
      if (sub.user === user && sub.path === path && JSON.stringify(filters) === JSON.stringify(sub.filters)) {
        subscribers.splice(subscribers.indexOf(sub), 1);
      }
    });

    if (!subscribers.length) {
      delete this.paths[path];
    }
  }

  public rem(user: User) {
    for (const [path, subs] of Object.entries(this.paths)) {
      for (const sub of subs) {
        if (sub.user === user) {
          subs.splice(subs.indexOf(sub), 1);
        }
      }

      if (!subs.length) {
        delete this.paths[path];
      }
    }
  }

  public find(path: string, data: any = {}): Subscribers {
    if (!this.paths[path]) {
      return [];
    }

    return this.paths[path].filter(sub => {
      return sub.path === path && match(typeof data === 'object' ? data : {}, sub.filters);
    });
  }

  public emit<D>(event: ServerEvent<D>): void {
    const { type, path, data } = event;
    this.send(path, data, event);

    const paths = path.replace(/^\//, '').split('/');
    if (paths.length > 1) {
      this.send(`/${paths.pop()}`, data, event, event);

      if (paths.length) {
        let base = '';
        for (const p of paths) {
          base = `${base}/${p}`;
          this.send(base, data, event, event);
        }
      }
    }
  }

  protected send<D>(path: string, data: D, event: ServerEvent<D>, origin?: ServerEvent<D>) {
    const { type } = event;
    this.find(path, data).forEach(sub => {
      const payload: ServerEvent<D> = {
        type,
        path: sub.path,
        data,
        filters: sub.filters,
      };

      if (origin) {
        payload.referer = { type: origin.type, path: origin.path };
      }

      Logger.info(`Event sent: [${event.type.toUpperCase()} ${path}].`);
      sub.send(payload);
    });
  }
}

class Subscription {
  public id: string;

  constructor(public user: User, public path: string, public filters: QueryFilter = {}) {
    this.id = uuid();
  }

  public send<D>(data: ServerEvent<D>) {
    this.user.send<D>(this.id, data);
  }
}
