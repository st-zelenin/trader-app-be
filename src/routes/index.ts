import { Router } from 'express';
import { requireAuth } from '../shared/middleware/auth.middleware';
import { userRouter } from './user.routes';
import { createExchangeRouter } from './exchange.routes';

const apiRouter = Router();
apiRouter.use(requireAuth);

apiRouter.use('/user', userRouter);
apiRouter.use('/binance', createExchangeRouter('binance'));
apiRouter.use('/bybit', createExchangeRouter('bybit'));
apiRouter.use('/crypto', createExchangeRouter('crypto'));
apiRouter.use('/gate', createExchangeRouter('gate'));

export default apiRouter;
