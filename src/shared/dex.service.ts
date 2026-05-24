import { Average, AverageSide, CryptoAverage, Order } from './models';

export function combineCexWithDexAverages(
  cex: CryptoAverage[],
  dex: CryptoAverage[]
): Record<string, Average> {
  const acc: Record<string, Average> = {};

  for (const curr of [...cex, ...dex]) {
    if (!acc[curr.currency_pair]) {
      acc[curr.currency_pair] = {
        buy: { money: 0, price: 0, volume: 0 },
        sell: { money: 0, price: 0, volume: 0 },
      };
    }
    const average = acc[curr.currency_pair];
    const side = curr.side.toLowerCase() === 'buy' ? average.buy : average.sell;
    side.money += curr.total_money;
    side.volume += curr.total_volume;
    side.price = side.volume > 0 ? side.money / side.volume : 0;
  }

  return acc;
}

export function combineCexWithDexOrders(cexOrders: Order[], dexOrders: Order[]): Order[] {
  const dexSorted = [...dexOrders];
  const result: Order[] = [];
  let dexIndex = 0;

  for (const cexOrder of cexOrders) {
    while (dexIndex < dexSorted.length && dexSorted[dexIndex].updateTimestamp > cexOrder.updateTimestamp) {
      result.push(dexSorted[dexIndex]);
      dexIndex++;
    }
    result.push(cexOrder);
  }

  while (dexIndex < dexSorted.length) {
    result.push(dexSorted[dexIndex]);
    dexIndex++;
  }

  return result;
}

export function emptyAverageSide(): AverageSide {
  return { money: 0, price: 0, volume: 0 };
}
