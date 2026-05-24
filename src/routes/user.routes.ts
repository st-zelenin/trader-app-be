import { Router } from 'express';
import { asyncHandler } from '../shared/middleware/auth.middleware';
import * as userHandlers from '../modules/user/user.handlers';

export const userRouter = Router();

userRouter.get('/GetUser', asyncHandler(userHandlers.getUser));
userRouter.post('/UpdateUser', asyncHandler(userHandlers.updateUser));
userRouter.post('/AddPair', asyncHandler(userHandlers.addPair));
userRouter.post('/RemovePair', asyncHandler(userHandlers.removePair));
userRouter.post('/OrderPairs', asyncHandler(userHandlers.orderPairs));
userRouter.post('/TogglePairArchive', asyncHandler(userHandlers.togglePairArchive));
userRouter.all('/DoSomeTechService', asyncHandler(userHandlers.doSomeTechService));
