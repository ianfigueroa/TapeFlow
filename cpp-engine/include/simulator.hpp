// High-throughput stochastic market simulator

#pragma once

#include "orderbook.hpp"
#include <random>
#include <atomic>
#include <chrono>
#include <thread>
#include <functional>

namespace hyperion {

// Market simulation statistics
struct SimulationStats {
    std::atomic<uint64_t> ordersGenerated{0};
    std::atomic<uint64_t> tradesExecuted{0};
    std::atomic<double> currentPrice{0.0};
    std::atomic<double> highPrice{0.0};
    std::atomic<double> lowPrice{0.0};
    std::atomic<double> ordersPerSecond{0.0};
    std::atomic<bool> running{false};
};

class MarketSimulator {
public:
    MarketSimulator(OrderBook& book, double startPrice = 92000.0)
        : book_(book)
        , basePrice_(startPrice)
        , currentPrice_(startPrice)
        , rng_(std::random_device{}())
        , priceDist_(-0.01, 0.01)      // ±1% price moves
        , sizeDist_(0.001, 2.0)         // 0.001 to 2 BTC
        , sideDist_(0, 1)               // 50/50 buy/sell
        , spreadDist_(0.5, 5.0)         // Spread factor
    {
        stats_.currentPrice = startPrice;
        stats_.highPrice = startPrice;
        stats_.lowPrice = startPrice;
    }
    
    // Start simulation at target orders per second
    void start(uint64_t targetOPS = 1000000) {
        if (stats_.running.exchange(true)) return; // Already running
        
        targetOPS_ = targetOPS;
        simulationThread_ = std::thread(&MarketSimulator::runSimulation, this);
    }
    
    void stop() {
        stats_.running = false;
        if (simulationThread_.joinable()) {
            simulationThread_.join();
        }
    }
    
    const SimulationStats& getStats() const { return stats_; }
    
    // Set callback for price updates (called every N orders)
    using PriceCallback = std::function<void(double price, uint64_t volume)>;
    void setPriceCallback(PriceCallback cb, uint64_t interval = 1000) {
        priceCallback_ = std::move(cb);
        callbackInterval_ = interval;
    }
    
    ~MarketSimulator() {
        stop();
    }

private:
    OrderBook& book_;
    double basePrice_;
    double currentPrice_;
    uint64_t targetOPS_;
    
    std::mt19937_64 rng_;
    std::uniform_real_distribution<double> priceDist_;
    std::uniform_real_distribution<double> sizeDist_;
    std::uniform_int_distribution<int> sideDist_;
    std::uniform_real_distribution<double> spreadDist_;
    
    SimulationStats stats_;
    std::thread simulationThread_;
    
    PriceCallback priceCallback_;
    uint64_t callbackInterval_ = 1000;
    
    void runSimulation() {
        auto startTime = std::chrono::high_resolution_clock::now();
        uint64_t orderCount = 0;
        uint64_t lastCallback = 0;
        
        // Batch size for tight loop
        constexpr uint64_t BATCH_SIZE = 10000;
        
        while (stats_.running) {
            auto batchStart = std::chrono::high_resolution_clock::now();
            
            // Generate batch of orders
            for (uint64_t i = 0; i < BATCH_SIZE && stats_.running; ++i) {
                generateOrder();
                orderCount++;
                stats_.ordersGenerated++;
                
                // Periodic callback
                if (priceCallback_ && (orderCount - lastCallback) >= callbackInterval_) {
                    priceCallback_(currentPrice_, orderCount);
                    lastCallback = orderCount;
                }
            }
            
            // Calculate and throttle to target OPS
            auto batchEnd = std::chrono::high_resolution_clock::now();
            auto elapsed = std::chrono::duration<double>(batchEnd - startTime).count();
            
            if (elapsed > 0) {
                stats_.ordersPerSecond = static_cast<double>(orderCount) / elapsed;
            }
            
            // Throttle if exceeding target
            double expectedTime = static_cast<double>(orderCount) / targetOPS_;
            if (elapsed < expectedTime) {
                auto sleepTime = std::chrono::duration<double>(expectedTime - elapsed);
                std::this_thread::sleep_for(sleepTime);
            }
            
            stats_.tradesExecuted = book_.getTradeCount();
        }
    }
    
    void generateOrder() {
        // Random walk price evolution
        double priceChange = priceDist_(rng_);
        currentPrice_ *= (1.0 + priceChange);
        
        // Mean reversion (pull back toward base price)
        double reversion = (basePrice_ - currentPrice_) * 0.0001;
        currentPrice_ += reversion;
        
        // Update stats
        stats_.currentPrice = currentPrice_;
        if (currentPrice_ > stats_.highPrice) stats_.highPrice = currentPrice_;
        if (currentPrice_ < stats_.lowPrice) stats_.lowPrice = currentPrice_;
        
        // Generate order
        Side side = sideDist_(rng_) == 0 ? Side::BID : Side::ASK;
        double spread = spreadDist_(rng_);
        double price = side == Side::BID 
            ? currentPrice_ - spread 
            : currentPrice_ + spread;
        double size = sizeDist_(rng_);
        
        book_.addOrder(side, price, size);
    }
};

} // namespace hyperion
