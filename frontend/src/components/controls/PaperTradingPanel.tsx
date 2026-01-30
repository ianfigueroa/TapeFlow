import { useState, useEffect, useCallback, useRef } from 'react';
import { PaperTradingEngine } from '../../paper/PaperTradingEngine';
import type { Position, OrderSide, OrderType } from '../../paper/types';
import { cn } from '../../lib/utils';

interface PaperTradingPanelProps {
  symbol: string;
  currentPrice: number;
  bestBid: number;
  bestAsk: number;
  onClose: () => void;
}

const engineInstance = new PaperTradingEngine(100000);

export function PaperTradingPanel({
  symbol,
  currentPrice,
  bestBid,
  bestAsk,
  onClose,
}: PaperTradingPanelProps) {
  const [side, setSide] = useState<OrderSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('0.01');
  const [limitPrice, setLimitPrice] = useState('');
  const [position, setPosition] = useState<Position | undefined>();
  const [account, setAccount] = useState(engineInstance.getAccount());
  const [, setRefresh] = useState(0);

  const priceUpdateRef = useRef<number>();

  useEffect(() => {
    const unsubscribe = engineInstance.onUpdate(() => {
      setPosition(engineInstance.getPosition(symbol));
      setAccount(engineInstance.getAccount());
      setRefresh((r) => r + 1);
    });
    return unsubscribe;
  }, [symbol]);

  useEffect(() => {
    if (bestBid > 0 && bestAsk > 0) {
      engineInstance.processMarketData(symbol, bestBid, bestAsk);
    }
    priceUpdateRef.current = window.requestAnimationFrame(() => {
      setPosition(engineInstance.getPosition(symbol));
    });
    return () => {
      if (priceUpdateRef.current) cancelAnimationFrame(priceUpdateRef.current);
    };
  }, [symbol, bestBid, bestAsk]);

  useEffect(() => {
    if (orderType === 'limit' && !limitPrice && currentPrice > 0) {
      setLimitPrice(currentPrice.toFixed(2));
    }
  }, [orderType, currentPrice, limitPrice]);

  const handleSubmit = useCallback(() => {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const price = orderType === 'limit' ? parseFloat(limitPrice) : undefined;
    if (orderType === 'limit' && (isNaN(price!) || price! <= 0)) return;

    engineInstance.placeOrder(symbol, side, orderType, qty, price);
    setQuantity('0.01');
  }, [symbol, side, orderType, quantity, limitPrice]);

  const handleFlatten = useCallback(() => {
    if (!position || position.side === 'flat') return;
    const closeSide: OrderSide = position.side === 'long' ? 'sell' : 'buy';
    engineInstance.placeOrder(symbol, closeSide, 'market', position.quantity);
  }, [symbol, position]);

  const equity = engineInstance.getTotalEquity();
  const winRate = engineInstance.getWinRate();

  return (
    <div className="bg-black border border-gray-800 rounded p-4 w-80 font-mono text-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-orange-500 uppercase text-xs tracking-wider">Paper Trading</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className="bg-gray-900 p-2 rounded">
          <div className="text-gray-600">Balance</div>
          <div className="text-white">${account.balance.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 p-2 rounded">
          <div className="text-gray-600">Equity</div>
          <div className="text-white">${equity.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900 p-2 rounded">
          <div className="text-gray-600">P&L</div>
          <div className={account.totalPnL >= 0 ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
            {account.totalPnL >= 0 ? '+' : ''}${account.totalPnL.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-900 p-2 rounded">
          <div className="text-gray-600">Win Rate</div>
          <div className="text-white">{winRate.toFixed(1)}%</div>
        </div>
      </div>

      {position && position.side !== 'flat' && (
        <div className="mb-4 p-2 border border-gray-800 rounded">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 text-xs uppercase">Position</span>
            <button
              onClick={handleFlatten}
              className="text-xs text-[#FF4545] hover:text-red-400"
            >
              FLATTEN
            </button>
          </div>
          <div className="flex justify-between text-xs">
            <span className={position.side === 'long' ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
              {position.side.toUpperCase()} {position.quantity}
            </span>
            <span className="text-gray-400">@ {position.entryPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-600">Unrealized</span>
            <span className={position.unrealizedPnL >= 0 ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
              {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setSide('buy')}
            className={cn(
              'flex-1 py-2 rounded text-xs uppercase font-bold',
              side === 'buy'
                ? 'bg-[#00FF41] text-black'
                : 'bg-gray-900 text-gray-600 hover:text-gray-400'
            )}
          >
            Buy
          </button>
          <button
            onClick={() => setSide('sell')}
            className={cn(
              'flex-1 py-2 rounded text-xs uppercase font-bold',
              side === 'sell'
                ? 'bg-[#FF4545] text-black'
                : 'bg-gray-900 text-gray-600 hover:text-gray-400'
            )}
          >
            Sell
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setOrderType('market')}
            className={cn(
              'flex-1 py-1 rounded text-xs',
              orderType === 'market'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-900 text-gray-600 hover:text-gray-400'
            )}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('limit')}
            className={cn(
              'flex-1 py-1 rounded text-xs',
              orderType === 'limit'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-900 text-gray-600 hover:text-gray-400'
            )}
          >
            Limit
          </button>
        </div>

        <div>
          <label className="text-gray-600 text-xs block mb-1">Quantity</label>
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-sm focus:border-gray-700 outline-none"
          />
        </div>

        {orderType === 'limit' && (
          <div>
            <label className="text-gray-600 text-xs block mb-1">Limit Price</label>
            <input
              type="text"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-sm focus:border-gray-700 outline-none"
            />
          </div>
        )}

        <button
          onClick={handleSubmit}
          className={cn(
            'w-full py-2 rounded text-xs uppercase font-bold',
            side === 'buy'
              ? 'bg-[#00FF41] text-black hover:bg-green-400'
              : 'bg-[#FF4545] text-black hover:bg-red-400'
          )}
        >
          {side === 'buy' ? 'Buy' : 'Sell'} {orderType === 'market' ? 'Market' : 'Limit'}
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800">
        <button
          onClick={() => engineInstance.reset()}
          className="w-full py-1 text-xs text-gray-600 hover:text-gray-400"
        >
          Reset Account
        </button>
      </div>
    </div>
  );
}
