# DELETION LOG

This document records files removed during the code cleanup phase, with rationale for each deletion.

## Hooks (Batch A)

| File | Reason |
|------|--------|
| `src/hooks/useDataWorker.ts` | Not imported anywhere in the codebase |
| `src/hooks/useHotkeys.ts` | Not imported anywhere in the codebase |
| `src/hooks/usePanelDimensions.ts` | Only used by `GridPanel.tsx` which is also unused |
| `src/hooks/useWorkerData.ts` | Only used by `SessionStats.tsx` which is also unused |
| `src/hooks/__tests__/usePanelDimensions.test.ts` | Test for deleted hook |

## Components (Batch B)

| File | Reason |
|------|--------|
| `src/components/CollapsibleSection.tsx` | Not imported anywhere |
| `src/components/DeltaChart.tsx` | Not imported anywhere |
| `src/components/ExportMenu.tsx` | Not imported anywhere |
| `src/components/GridDashboard.tsx` | Not imported anywhere |
| `src/components/HelpPanel.tsx` | Not imported anywhere |
| `src/components/OrderBookHeatmap.tsx` | Not imported anywhere |
| `src/components/PnLPanel.tsx` | Not imported anywhere |
| `src/components/SentimentPanel.tsx` | Not imported anywhere |
| `src/components/SessionStats.tsx` | Not imported anywhere |
| `src/components/StatusBar.tsx` | Not imported anywhere |
| `src/components/SymbolHeader.tsx` | Not imported anywhere |
| `src/components/TradeHistoryPanel.tsx` | Not imported anywhere |
| `src/components/TradingDashboard.tsx` | Not imported anywhere |
| `src/components/controls/index.ts` | Re-exports unused controls |
| `src/components/dashboard/index.ts` | Re-exports unused dashboard components |
| `src/components/dashboard/MultiAssetView.tsx` | Not imported anywhere |
| `src/components/dashboard/SymbolPanel.tsx` | Not imported anywhere |
| `src/components/layout/DashboardGrid.tsx` | Not imported anywhere |
| `src/components/layout/GridPanel.tsx` | Not imported anywhere |
| `src/components/layout/index.ts` | Re-exports unused layout components |
| `src/components/layout/LayoutControls.tsx` | Not imported anywhere |
| `src/components/__tests__/DashboardLayout.test.tsx` | Test for unused/removed patterns |
| `src/components/__tests__/TapeTable.test.tsx` | Test for unused/removed patterns |
| `src/components/layout/__tests__/DashboardGrid.test.tsx` | Test for deleted component |
| `src/components/layout/__tests__/GridPanel.test.tsx` | Test for deleted component |
| `src/components/layout/__tests__/LayoutControls.test.tsx` | Test for deleted component |

## Data & Services (Batch C)

| File | Reason |
|------|--------|
| `src/data/CSVExporter.ts` | Not imported anywhere |
| `src/data/index.ts` | Re-exports unused data utilities |
| `src/data/sources/index.ts` | Re-exports unused data sources |
| `src/data/sources/LiveSource.ts` | Not imported anywhere |
| `src/services/workerBridge.ts` | Not imported anywhere |

## Stores (Batch D)

| File | Reason |
|------|--------|
| `src/stores/useLayoutStore.ts` | Not imported anywhere |
| `src/stores/useRecordingStore.ts` | Not imported anywhere |
| `src/stores/__tests__/useLayoutStore.test.ts` | Test for deleted store |
| `src/stores/__tests__/usePaperTradingStore.test.ts` | Test references deleted patterns |

## Other (Batch E)

| File | Reason |
|------|--------|
| `src/alerts/index.ts` | Re-exports unused alert module |
| `src/paper/index.ts` | Re-exports unused paper trading module |
| `src/sentiment/index.ts` | Re-exports unused sentiment module |
| `src/sentiment/SentimentEngine.ts` | Not imported anywhere |
| `src/sentiment/types.ts` | Only used by deleted SentimentEngine |
| `src/styles/react-grid-layout.css` | Styles for removed react-grid-layout |
| `src/test/setup.ts` | Test setup not referenced |
| `src/types/layout.ts` | Types only for removed layout components |
| `src/workers/data.worker.ts` | Web worker not imported/instantiated anywhere |

## NPM Dependencies

| Package | Reason |
|---------|--------|
| `react-grid-layout` | Not imported anywhere (grid dashboard removed) |
| `@types/react-grid-layout` | Types for removed package |

---

*Generated during cleanup session*
