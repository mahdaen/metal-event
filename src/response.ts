import { ClientMessage, ServerResponse } from './interface';
import { User } from './user';

export class Response<D> {
  private raw: ServerResponse<any> = {
    status: 200,
    statusText: 'Success',
    headers: {}
  }
  public state: 'ready' | 'sent' = 'ready';
  public body: D;

  constructor(private user: User, private request: ClientMessage<any>) {}

  public status(status: number): this {
    this.raw.status = status;
    return this;
  }

  public statusText(text: string): this {
    this.raw.statusText = text;
    return this;
  }

  public set(key: string, value: string): this {
    this.raw.headers[key] = value;
    return this;
  }

  public setHeader(key: string, value: string): this {
    this.set(key, value);
    return this;
  }

  public send(body?: D): void {
    const { uuid } = this.request;
    if (this.raw.status < 200 || this.raw.status >= 300) {
      this.raw.statusText = 'Error.';
    }
    this.user.response<D>(uuid, { ...this.raw, data: body });
    this.body = body;
    this.state = 'sent';
  }
}
