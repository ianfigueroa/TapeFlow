/**
 * Tooltip - Informative hover tooltips for key trading terms
 * 
 * Provides explanations for trading terminology to make the app
 * more accessible to new users.
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { cn } from '../lib/utils';

// Predefined explanations for common trading terms
export const TRADING_TERMS: Record<string, string> = {
  // Volume & Flow
  CVD: 'Cumulative Volume Delta: The running total of buying volume minus selling volume. Rising CVD suggests buying pressure, falling CVD suggests selling pressure.',
  'Volume Delta': 'The difference between buying and selling volume in a given period. Positive delta = more buying, negative delta = more selling.',
  'Volume Profile': 'Shows the distribution of traded volume at each price level. Helps identify support/resistance zones.',
  POC: 'Point of Control: The price level with the highest traded volume. Often acts as a magnet for price.',
  VAH: 'Value Area High: Upper boundary of the price range containing 70% of trading volume.',
  VAL: 'Value Area Low: Lower boundary of the price range containing 70% of trading volume.',
  VWAP: 'Volume Weighted Average Price: The average price weighted by volume. Used as a benchmark for execution quality.',
  
  // Order Book
  DOM: 'Depth of Market: Shows pending buy and sell orders at each price level.',
  'Bid/Ask': 'Bid is the highest price buyers will pay. Ask is the lowest price sellers will accept.',
  Spread: 'The difference between the best bid and best ask prices. Tighter spread = more liquid market.',
  Imbalance: 'The ratio of bid to ask volume. High imbalance may predict short-term price direction.',
  Liquidity: 'The ability to buy or sell without significantly impacting price. More orders = more liquidity.',
  
  // Open Interest & Liquidations
  'Open Interest': 'Total number of outstanding derivative contracts. Rising OI = new money entering, falling OI = positions closing.',
  'OI Delta': 'Change in open interest. Positive with rising price = strong bullish signal.',
  Liquidations: 'Forced closure of leveraged positions. Large liquidations often cause price cascades.',
  'Funding Rate': 'Periodic payments between long and short traders to keep perpetual prices aligned with spot.',
  
  // Footprint / Cluster
  Footprint: 'Detailed view showing buy/sell volume at each price level within each candle.',
  Cluster: 'A footprint chart candle showing volume distribution across price levels.',
  'Tick Size': 'The minimum price increment for grouping trades in footprint/cluster charts.',
  
  // General
  'Time & Sales': 'Real-time list of executed trades showing price, size, and direction.',
  'Market Orders': 'Orders that execute immediately at the current market price.',
  'Limit Orders': 'Orders that execute only at a specified price or better.',
  Iceberg: 'A large order split into smaller visible portions to hide true size.',
};

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  maxWidth?: number;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
  className,
  maxWidth = 280,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  
  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };
  
  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };
  
  // Calculate position
  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;
    
    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const padding = 8;
    
    let x = 0;
    let y = 0;
    
    switch (position) {
      case 'top':
        x = trigger.left + trigger.width / 2 - tooltip.width / 2;
        y = trigger.top - tooltip.height - padding;
        break;
      case 'bottom':
        x = trigger.left + trigger.width / 2 - tooltip.width / 2;
        y = trigger.bottom + padding;
        break;
      case 'left':
        x = trigger.left - tooltip.width - padding;
        y = trigger.top + trigger.height / 2 - tooltip.height / 2;
        break;
      case 'right':
        x = trigger.right + padding;
        y = trigger.top + trigger.height / 2 - tooltip.height / 2;
        break;
    }
    
    // Keep within viewport
    x = Math.max(8, Math.min(x, window.innerWidth - tooltip.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - tooltip.height - 8));
    
    setCoords({ x, y });
  }, [isVisible, position]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
  
  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={cn("inline-flex", className)}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] px-3 py-2 rounded-lg text-xs shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: coords.x,
            top: coords.y,
            maxWidth,
            backgroundColor: 'var(--tf-bg-tertiary)',
            border: '1px solid var(--tf-border-secondary)',
            color: 'var(--tf-text-primary)',
          }}
        >
          {content}
          {/* Arrow */}
          <div
            className="absolute w-2 h-2 rotate-45"
            style={{
              backgroundColor: 'var(--tf-bg-tertiary)',
              borderColor: 'var(--tf-border-secondary)',
              ...(position === 'top' && {
                bottom: -4,
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                borderRight: '1px solid var(--tf-border-secondary)',
                borderBottom: '1px solid var(--tf-border-secondary)',
              }),
              ...(position === 'bottom' && {
                top: -4,
                left: '50%',
                transform: 'translateX(-50%) rotate(45deg)',
                borderLeft: '1px solid var(--tf-border-secondary)',
                borderTop: '1px solid var(--tf-border-secondary)',
              }),
              ...(position === 'left' && {
                right: -4,
                top: '50%',
                transform: 'translateY(-50%) rotate(45deg)',
                borderRight: '1px solid var(--tf-border-secondary)',
                borderTop: '1px solid var(--tf-border-secondary)',
              }),
              ...(position === 'right' && {
                left: -4,
                top: '50%',
                transform: 'translateY(-50%) rotate(45deg)',
                borderLeft: '1px solid var(--tf-border-secondary)',
                borderBottom: '1px solid var(--tf-border-secondary)',
              }),
            }}
          />
        </div>
      )}
    </>
  );
}

/**
 * InfoTooltip - Helper component for term explanations
 * Shows a small "?" icon that displays explanation on hover
 */
interface InfoTooltipProps {
  term: keyof typeof TRADING_TERMS | string;
  className?: string;
}

export function InfoTooltip({ term, className }: InfoTooltipProps) {
  const explanation = TRADING_TERMS[term] || term;
  
  return (
    <Tooltip content={explanation} position="top">
      <span 
        className={cn(
          "inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] cursor-help ml-1",
          className
        )}
        style={{
          backgroundColor: 'var(--tf-bg-tertiary)',
          color: 'var(--tf-text-muted)',
          border: '1px solid var(--tf-border-secondary)',
        }}
      >
        ?
      </span>
    </Tooltip>
  );
}

/**
 * LabelWithTooltip - A label that shows explanation on hover
 */
interface LabelWithTooltipProps {
  label: string;
  term?: keyof typeof TRADING_TERMS | string;
  className?: string;
}

export function LabelWithTooltip({ label, term, className }: LabelWithTooltipProps) {
  const termKey = term || label;
  const explanation = TRADING_TERMS[termKey];
  
  if (!explanation) {
    return <span className={className}>{label}</span>;
  }
  
  return (
    <Tooltip content={explanation} position="top">
      <span 
        className={cn("cursor-help border-b border-dotted", className)}
        style={{ borderColor: 'var(--tf-text-muted)' }}
      >
        {label}
      </span>
    </Tooltip>
  );
}
