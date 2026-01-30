import { SymbolPanel } from './SymbolPanel';

export type SplitMode = 'single' | 'split-50' | 'split-60-40';

interface MultiAssetViewProps {
  symbols: string[];
  splitMode: SplitMode;
  width: number;
  height: number;
}

export function MultiAssetView({ symbols, splitMode, width, height }: MultiAssetViewProps) {
  if (symbols.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-600 font-mono text-sm"
        style={{ width, height }}
      >
        &gt; No symbols selected
      </div>
    );
  }

  if (splitMode === 'single' || symbols.length === 1) {
    return (
      <div className="p-2" style={{ width, height }}>
        <SymbolPanel
          symbol={symbols[0]}
          width={width - 16}
          height={height - 16}
        />
      </div>
    );
  }

  const gap = 8;
  const padding = 16;
  const availableWidth = width - padding - gap;

  let leftWidth: number;
  let rightWidth: number;

  if (splitMode === 'split-60-40') {
    leftWidth = Math.floor(availableWidth * 0.6);
    rightWidth = availableWidth - leftWidth;
  } else {
    leftWidth = Math.floor(availableWidth / 2);
    rightWidth = availableWidth - leftWidth;
  }

  const panelHeight = height - padding;

  return (
    <div className="flex gap-2 p-2" style={{ width, height }}>
      <SymbolPanel
        symbol={symbols[0]}
        width={leftWidth}
        height={panelHeight}
        compact={splitMode === 'split-50'}
      />
      {symbols[1] && (
        <SymbolPanel
          symbol={symbols[1]}
          width={rightWidth}
          height={panelHeight}
          compact={splitMode === 'split-50'}
        />
      )}
    </div>
  );
}
