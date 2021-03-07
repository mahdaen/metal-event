import WebSocket from 'ws';
import { QueryFilter } from './filter';
import { ServerEvent, ServerResponse } from './interface';
import { Logger } from './logger';

export type Users = {
  [id: string]: User;
};

export type UserContext = {
  client: WebSocket;
  clientId: string;
}

export type UserSubscription = {
  user: User;
  filters?: QueryFilter;
}

export class User {
  private queues: { uuid: string, data: ServerEvent<any> }[] = [];
  public client: WebSocket;
  public clientId: string;
  public disconnected: Date;

  constructor(context: UserContext) {
    Object.assign(this, context);

    this.client.on('close', () => {
      this.disconnected = new Date();
      Logger.info(`User disconnected: ${this.clientId}. Scheduled for cleanup.`);
    });

    Logger.info(`User connected: ${this.clientId}.`);
  }

  public send<D>(uuid: string, data: ServerEvent<D>): void {
    if (this.client.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify({ type: 'event', uuid, data }));
      Logger.info(`Event sent to: ${uuid}.`);
    } else {
      this.queues.push({ uuid, data });
      Logger.info(`Event queued: ${uuid}.`);
    }
  }

  public response<D>(uuid: string, data: ServerResponse<D>): void {
    data.headers = this.createHeaders(data);
    this.client.send(JSON.stringify({ type: 'response', uuid, data }));
    Logger.info(`Response sent: ${uuid}.`);
  }

  public upgrade(context: UserContext, reconnect?: boolean) {
    Object.assign(this, context);

    this.disconnected = null;
    this.client.on('close', () => {
      this.disconnected = new Date();
      Logger.info(`User disconnected: ${this.clientId}. Scheduled for cleanup.`);
    });

    if (reconnect && this.queues.length) {
      for (const queue of this.queues) {
        this.send(queue.uuid, queue.data);
      }

      this.queues = [];
    }

    Logger.info(`User reconnected: ${this.clientId}.`);
  }

  protected createHeaders(data: ServerResponse<any>) {
    const headers = {
      ...data.headers || {},
      'X-Powered-By': 'Event Bridge',
      'Date': new Date().toISOString()
    };

    if (typeof data.data === 'string') {
      headers['Content-Type'] = 'text/html';
      headers['Content-Length'] = data.data.length;
    } else if (typeof data === 'object') {
      headers['Content-Type'] = 'application/json';
    } else {
      headers['Content-Type'] = '*/*';
    }

    return headers;
  }
}
