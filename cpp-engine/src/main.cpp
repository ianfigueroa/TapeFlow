#include <iostream>
#include <chrono>
#include <iomanip>
#include <thread>
#include "orderbook.hpp"
#include "simulator.hpp"

using namespace hyperion;

void printBook(const OrderBook& book) {
    std::cout << "\n--- Order Book ---\n";
    std::cout << "Best Bid: " << std::fixed << std::setprecision(2) << book.getBestBid() << "\n";
    std::cout << "Best Ask: " << std::fixed << std::setprecision(2) << book.getBestAsk() << "\n";
    std::cout << "Spread:   " << std::fixed << std::setprecision(2) << book.getSpread() << "\n";
    std::cout << "Trades:   " << book.getTradeCount() << "\n";
}

void runBenchmark() {
    std::cout << "\n========================================\n";
    std::cout << "  BENCHMARK: 1M Orders/Second Target\n";
    std::cout << "========================================\n\n";
    
    OrderBook book("BTCUSDT");
    MarketSimulator simulator(book, 92000.0);
    
    // Start simulation at 1M orders/sec target
    simulator.start(1000000);
    
    // Run for 5 seconds, print stats every second
    for (int i = 0; i < 5; ++i) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        
        const auto& stats = simulator.getStats();
        std::cout << "[" << (i + 1) << "s] "
                  << "Orders: " << std::setw(10) << stats.ordersGenerated.load()
                  << " | OPS: " << std::setw(10) << std::fixed << std::setprecision(0) << stats.ordersPerSecond.load()
                  << " | Price: $" << std::setprecision(2) << stats.currentPrice.load()
                  << " | Trades: " << stats.tradesExecuted.load()
                  << "\n";
    }
    
    simulator.stop();
    
    const auto& stats = simulator.getStats();
    std::cout << "\n--- Final Stats ---\n";
    std::cout << "Total Orders:  " << stats.ordersGenerated.load() << "\n";
    std::cout << "Total Trades:  " << stats.tradesExecuted.load() << "\n";
    std::cout << "Avg OPS:       " << std::fixed << std::setprecision(0) << stats.ordersPerSecond.load() << "\n";
    std::cout << "Price Range:   $" << std::setprecision(2) << stats.lowPrice.load() 
              << " - $" << stats.highPrice.load() << "\n";
}

int main() {
    std::cout << "\n";
    std::cout << "========================================\n";
    std::cout << "  HYPERION ENGINE ONLINE\n";
    std::cout << "  High-Frequency Trading Simulator\n";
    std::cout << "========================================\n";
    std::cout << "\n";
    std::cout << "C++ Standard: " << __cplusplus << "\n";
    std::cout << "Build Time:   " << __DATE__ << " " << __TIME__ << "\n";
    std::cout << "\n";
    
    // Test the order book
    OrderBook book("BTCUSDT");
    
    // Set up trade callback
    book.setTradeCallback([](const Trade& trade) {
        std::cout << "[TRADE] " << std::fixed << std::setprecision(4) 
                  << trade.quantity << " @ $" << std::setprecision(2) << trade.price << "\n";
    });
    
    std::cout << "Testing Order Book...\n";
    
    // Add some limit orders
    book.addOrder(Side::BID, 92000.00, 1.5);   // Buy 1.5 BTC @ $92,000
    book.addOrder(Side::BID, 91900.00, 2.0);   // Buy 2.0 BTC @ $91,900
    book.addOrder(Side::ASK, 92100.00, 1.0);   // Sell 1.0 BTC @ $92,100
    book.addOrder(Side::ASK, 92200.00, 0.5);   // Sell 0.5 BTC @ $92,200
    
    printBook(book);
    
    // Market sell (cross the spread)
    std::cout << "\nIncoming Market Sell 0.8 BTC...\n";
    book.addOrder(Side::ASK, 91000.00, 0.8);   // Aggressive sell
    
    printBook(book);
    
    // Market buy (cross the spread)
    std::cout << "\nIncoming Market Buy 1.2 BTC...\n";
    book.addOrder(Side::BID, 93000.00, 1.2);   // Aggressive buy
    
    printBook(book);
    
    std::cout << "\nOrder Book test complete.\n";
    
    // Run high-frequency benchmark
    runBenchmark();
    
    return 0;
}

