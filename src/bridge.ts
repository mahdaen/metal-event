import cors from 'cors';
import Express, { Request, Response } from 'express';
import { createServer } from 'http';
import { MetalEvent } from 'server';
import { v4 as uuid } from 'uuid';
import { LogLevel } from './logger';

const { DRIVER_PORT, DRIVER_SECRET, SERVER_URL } = process.env;

const app = Express();
const svr = createServer(app);
const api = new MetalEvent(svr, { logLevel: LogLevel.INFO });

app.use(Express.json());

api.all<any, any>('/**', (req, res) => {
  res.send(req.body || { id: uuid(), meta: {}, data: [] });
});
app.all('/**', cors({
  origin: (origin, cb) => {
    cb(null, origin);
  }
}), (req: Request, res: Response) => {
  if (req.headers['x-server-secret'] !== DRIVER_SECRET) {
    res.status(401);
    res.send('Unauthorized access.');
    return;
  }

  if (['post', 'put', 'patch', 'delete'].includes(req.method.toLowerCase())) {
    api.emit({ type: req.method.toLowerCase() as any, path: req.path, data: req.body });
  }

  res.send('Success.');
});

export default function serve() {
  svr.listen(DRIVER_PORT || 3000, () => {
    console.log(`Server listening on port: ${DRIVER_PORT || 3000}`);
  });
}
