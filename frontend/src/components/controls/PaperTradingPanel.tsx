import { useState, useEffect, useCallback, useRef } from 'react';
import { PaperTradingEngine } from '../../paper/PaperTradingEngine';
import type { Position, OrderSide, OrderType, PaperOrder, PaperTradingConfig } from '../../paper/types';
import { DEFAULT_PAPER_TRADING_CONFIG } from '../../paper/types';
import { cn } from '../../lib/utils';

interface PaperTradingPanelProps {
  symbol: string;
  currentPrice: number;
  bestBid: number;
  bestAsk: number;
  onClose: () => void;
}

const engineInstance = new PaperTradingEngine(100000);

// Tab types for the panel
type PanelTab = 'order' | 'orders' | 'settings';

export function PaperTradingPanel({
  symbol,
  currentPrice,
  bestBid,
  bestAsk,
  onClose,
}: PaperTradingPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('order');
  const [side, setSide] = useState<OrderSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [quantity, setQuantity] = useState('0.01');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [showBracket, setShowBracket] = useState(false);
  const [position, setPosition] = useState<Position | undefined>();
  const [account, setAccount] = useState(engineInstance.getAccount());
  const [openOrders, setOpenOrders] = useState<PaperOrder[]>([]);
  const [config, setConfig] = useState<PaperTradingConfig>(engineInstance.getConfig());
  const [, setRefresh] = useState(0);

  const priceUpdateRef = useRef<number>();

  useEffect(() => {
    const unsubscribe = engineInstance.onUpdate(() => {
      setPosition(engineInstance.getPosition(symbol));
      setAccount(engineInstance.getAccount());
      setOpenOrders(engineInstance.getOpenOrders());
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
      setOpenOrders(engineInstance.getOpenOrders());
    });
    return () => {
      if (priceUpdateRef.current) cancelAnimationFrame(priceUpdateRef.current);
    };
  }, [symbol, bestBid, bestAsk]);

  useEffect(() => {
    if ((orderType === 'limit' || orderType === 'stop-limit') && !limitPrice && currentPrice > 0) {
      setLimitPrice(currentPrice.toFixed(2));
    }
    if ((orderType === 'stop' || orderType === 'stop-limit') && !stopPrice && currentPrice > 0) {
      // Default stop price: slightly below/above current for sell/buy
      const defaultStop = side === 'sell' 
        ? (currentPrice * 0.99).toFixed(2)
        : (currentPrice * 1.01).toFixed(2);
      setStopPrice(defaultStop);
    }
  }, [orderType, currentPrice, limitPrice, stopPrice, side]);

  const handleSubmit = useCallback(() => {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;

    let price: number | undefined;
    let stopPriceNum: number | undefined;
    let sl: number | undefined;
    let tp: number | undefined;

    if (orderType === 'limit' || orderType === 'stop-limit') {
      price = parseFloat(limitPrice);
      if (isNaN(price) || price <= 0) return;
    }

    if (orderType === 'stop' || orderType === 'stop-limit') {
      stopPriceNum = parseFloat(stopPrice);
      if (isNaN(stopPriceNum) || stopPriceNum <= 0) return;
    }

    if (showBracket) {
      if (stopLoss) {
        sl = parseFloat(stopLoss);
        if (isNaN(sl)) sl = undefined;
      }
      if (takeProfit) {
        tp = parseFloat(takeProfit);
        if (isNaN(tp)) tp = undefined;
      }
    }

    engineInstance.placeOrder(symbol, side, orderType, qty, price, {
      stopPrice: stopPriceNum,
      stopLoss: sl,
      takeProfit: tp,
    });
    
    setQuantity('0.01');
    setStopLoss('');
    setTakeProfit('');
  }, [symbol, side, orderType, quantity, limitPrice, stopPrice, stopLoss, takeProfit, showBracket]);

  const handleFlatten = useCallback(() => {
    if (!position || position.side === 'flat') return;
    const closeSide: OrderSide = position.side === 'long' ? 'sell' : 'buy';
    engineInstance.placeOrder(symbol, closeSide, 'market', position.quantity);
  }, [symbol, position]);

  const handleCancelOrder = useCallback((orderId: string) => {
    engineInstance.cancelOrder(orderId);
  }, []);

  const handleConfigChange = useCallback((key: keyof PaperTradingConfig, value: boolean | number) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    engineInstance.setConfig(newConfig);
  }, [config]);

  const equity = engineInstance.getTotalEquity();
  const winRate = engineInstance.getWinRate();

  return (
    <div className="bg-black border border-gray-800 rounded p-4 w-96 font-mono text-sm max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-orange-500 uppercase text-xs tracking-wider">Paper Trading</h3>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Account Stats */}
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

      {/* Commission/Slippage Stats */}
      {(account.totalCommission > 0 || account.totalSlippage > 0) && (
        <div className="flex gap-4 mb-4 text-xs text-gray-500">
          <span>Fees: ${account.totalCommission.toFixed(2)}</span>
          <span>Slippage: ${account.totalSlippage.toFixed(2)}</span>
        </div>
      )}

      {/* Position Display */}
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

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['order', 'orders', 'settings'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-1.5 text-xs uppercase transition-colors',
              activeTab === tab
                ? 'text-[#00FF41] border-b-2 border-[#00FF41]'
                : 'text-gray-600 hover:text-gray-400'
            )}
          >
            {tab === 'orders' ? `Orders (${openOrders.length})` : tab}
          </button>
        ))}
      </div>

      {/* Order Tab */}
      {activeTab === 'order' && (
        <div className="space-y-3">
          {/* Buy/Sell Toggle */}
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

          {/* Order Type Selection */}
          <div className="grid grid-cols-4 gap-1">
            {(['market', 'limit', 'stop', 'stop-limit'] as OrderType[]).map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={cn(
                  'py-1 rounded text-xs capitalize',
                  orderType === type
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-900 text-gray-600 hover:text-gray-400'
                )}
              >
                {type === 'stop-limit' ? 'S-Limit' : type}
              </button>
            ))}
          </div>

          {/* Quantity Input */}
          <div>
            <label className="text-gray-600 text-xs block mb-1">Quantity</label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-sm focus:border-gray-700 outline-none"
            />
          </div>

          {/* Stop Price (for stop and stop-limit orders) */}
          {(orderType === 'stop' || orderType === 'stop-limit') && (
            <div>
              <label className="text-gray-600 text-xs block mb-1">Stop Price</label>
              <input
                type="text"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-sm focus:border-gray-700 outline-none"
              />
            </div>
          )}

          {/* Limit Price (for limit and stop-limit orders) */}
          {(orderType === 'limit' || orderType === 'stop-limit') && (
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

          {/* Bracket Order Toggle */}
          <button
            onClick={() => setShowBracket(!showBracket)}
            className={cn(
              'w-full py-1 rounded text-xs border transition-colors',
              showBracket
                ? 'border-orange-500 text-orange-500'
                : 'border-gray-800 text-gray-600 hover:text-gray-400'
            )}
          >
            {showBracket ? '▼' : '▶'} Bracket Order (SL/TP)
          </button>

          {/* Stop Loss / Take Profit */}
          {showBracket && (
            <div className="grid grid-cols-2 gap-2 p-2 bg-gray-900/50 rounded">
              <div>
                <label className="text-[#FF4545] text-xs block mb-1">Stop Loss</label>
                <input
                  type="text"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder={side === 'buy' ? 'Below entry' : 'Above entry'}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-sm focus:border-[#FF4545] outline-none placeholder-gray-700"
                />
              </div>
              <div>
                <label className="text-[#00FF41] text-xs block mb-1">Take Profit</label>
                <input
                  type="text"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder={side === 'buy' ? 'Above entry' : 'Below entry'}
                  className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-sm focus:border-[#00FF41] outline-none placeholder-gray-700"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            className={cn(
              'w-full py-2 rounded text-xs uppercase font-bold',
              side === 'buy'
                ? 'bg-[#00FF41] text-black hover:bg-green-400'
                : 'bg-[#FF4545] text-black hover:bg-red-400'
            )}
          >
            {side === 'buy' ? 'Buy' : 'Sell'} {orderType}
          </button>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="space-y-2">
          {openOrders.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-4">
              No open orders
            </div>
          ) : (
            openOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-2 bg-gray-900 rounded text-xs"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={order.side === 'buy' ? 'text-[#00FF41]' : 'text-[#FF4545]'}>
                      {order.side.toUpperCase()}
                    </span>
                    <span className="text-gray-400">{order.quantity}</span>
                    <span className="text-gray-600 capitalize">{order.type}</span>
                  </div>
                  <div className="text-gray-600 mt-0.5">
                    {order.price && <span>@ ${order.price.toFixed(2)}</span>}
                    {order.stopPrice && <span> Stop: ${order.stopPrice.toFixed(2)}</span>}
                    {order.status === 'triggered' && (
                      <span className="text-orange-500 ml-2">TRIGGERED</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleCancelOrder(order.id)}
                  className="text-gray-600 hover:text-[#FF4545] p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* Slippage Settings */}
          <div className="p-3 bg-gray-900/50 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs uppercase">Slippage Simulation</span>
              <button
                onClick={() => handleConfigChange('slippageEnabled', !config.slippageEnabled)}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  config.slippageEnabled ? 'bg-[#00FF41]' : 'bg-gray-700'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                    config.slippageEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
            {config.slippageEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-xs">Base %</span>
                  <input
                    type="number"
                    step="0.01"
                    value={config.slippagePercent}
                    onChange={(e) => handleConfigChange('slippagePercent', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-xs text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-xs">Volatility ±%</span>
                  <input
                    type="number"
                    step="0.01"
                    value={config.slippageVolatility}
                    onChange={(e) => handleConfigChange('slippageVolatility', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-xs text-right"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Commission Settings */}
          <div className="p-3 bg-gray-900/50 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs uppercase">Commission</span>
              <button
                onClick={() => handleConfigChange('commissionEnabled', !config.commissionEnabled)}
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  config.commissionEnabled ? 'bg-[#00FF41]' : 'bg-gray-700'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                    config.commissionEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
            {config.commissionEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-xs">Rate %</span>
                  <input
                    type="number"
                    step="0.001"
                    value={config.commissionPercent}
                    onChange={(e) => handleConfigChange('commissionPercent', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-xs text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-xs">Minimum $</span>
                  <input
                    type="number"
                    step="0.01"
                    value={config.commissionMin}
                    onChange={(e) => handleConfigChange('commissionMin', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-white text-xs text-right"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reset to Defaults */}
          <button
            onClick={() => {
              setConfig(DEFAULT_PAPER_TRADING_CONFIG);
              engineInstance.setConfig(DEFAULT_PAPER_TRADING_CONFIG);
            }}
            className="w-full py-1 text-xs text-gray-600 hover:text-gray-400 border border-gray-800 rounded"
          >
            Reset to Defaults
          </button>
        </div>
      )}

      {/* Reset Account Button */}
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
