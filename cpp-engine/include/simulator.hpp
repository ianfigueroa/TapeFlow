// High-throughput stochastic market simulator with realistic human-like behavior

#pragma once

#include "orderbook.hpp"
#include <random>
#include <atomic>
#include <chrono>
#include <thread>
#include <functional>
#include <cmath>
#include <deque>

namespace hyperion
{

    // Market simulation statistics
    struct SimulationStats
    {
        std::atomic<uint64_t> ordersGenerated{0};
        std::atomic<uint64_t> tradesExecuted{0};
        std::atomic<uint64_t> ordersCancelled{0};
        std::atomic<double> currentPrice{0.0};
        std::atomic<double> highPrice{0.0};
        std::atomic<double> lowPrice{0.0};
        std::atomic<double> ordersPerSecond{0.0};
        std::atomic<double> volatility{0.0};
        std::atomic<double> vwap{0.0};
        std::atomic<double> cumulativeDelta{0.0};
        std::atomic<double> buyVolume{0.0};
        std::atomic<double> sellVolume{0.0};
        std::atomic<bool> running{false};
    };

    // Trader persona types for realistic behavior
    enum class TraderType
    {
        MARKET_MAKER,    // Provides liquidity, tight spreads, high cancel rate
        RETAIL,          // Small orders, market orders, emotional
        INSTITUTIONAL,   // Large orders, patient, iceberg style
        ALGO_MOMENTUM,   // Follows trends, quick reactions
        ALGO_MEAN_REVERT // Fades moves, contrarian
    };

    class MarketSimulator
    {
    public:
        MarketSimulator(OrderBook &book, double startPrice = 92000.0)
            : book_(book), basePrice_(startPrice), currentPrice_(startPrice), vwap_(startPrice), rng_(std::random_device{}()), normalDist_(0.0, 1.0), uniformDist_(0.0, 1.0)
        {
            stats_.currentPrice = startPrice;
            stats_.highPrice = startPrice;
            stats_.lowPrice = startPrice;

            // Initialize price history for volatility calc
            for (int i = 0; i < 100; ++i)
            {
                priceHistory_.push_back(startPrice);
            }
        }

        // Start simulation at target orders per second
        void start(uint64_t targetOPS = 1000000)
        {
            if (stats_.running.exchange(true))
                return;

            targetOPS_ = targetOPS;
            simulationThread_ = std::thread(&MarketSimulator::runSimulation, this);
        }

        void stop()
        {
            stats_.running = false;
            if (simulationThread_.joinable())
            {
                simulationThread_.join();
            }
        }

        const SimulationStats &getStats() const { return stats_; }

        using PriceCallback = std::function<void(double price, uint64_t volume)>;
        void setPriceCallback(PriceCallback cb, uint64_t interval = 1000)
        {
            priceCallback_ = std::move(cb);
            callbackInterval_ = interval;
        }

        ~MarketSimulator()
        {
            stop();
        }

    private:
        OrderBook &book_;
        double basePrice_;
        double currentPrice_;
        double vwap_;
        uint64_t targetOPS_;

        std::mt19937_64 rng_;
        std::normal_distribution<double> normalDist_;
        std::uniform_real_distribution<double> uniformDist_;

        // Market state
        double momentum_ = 0.0;
        double realizedVolatility_ = 0.0002; // ~2 bps per tick
        std::deque<double> priceHistory_;
        std::deque<uint64_t> pendingOrderIds_;
        
        // Rolling OPS calculation (more accurate than cumulative average)
        std::deque<std::pair<uint64_t, std::chrono::high_resolution_clock::time_point>> opsWindow_;

        // Order flow imbalance tracking
        double buyPressure_ = 0.5;
        int consecutiveBuys_ = 0;
        int consecutiveSells_ = 0;
        double totalBuyVolume_ = 0.0;
        double totalSellVolume_ = 0.0;

        SimulationStats stats_;
        std::thread simulationThread_;

        PriceCallback priceCallback_;
        uint64_t callbackInterval_ = 1000;

        void runSimulation()
        {
            auto startTime = std::chrono::high_resolution_clock::now();
            uint64_t orderCount = 0;
            uint64_t lastCallback = 0;
            uint64_t lastCleanup = 0;

            constexpr uint64_t BATCH_SIZE = 10000;
            constexpr uint64_t CLEANUP_INTERVAL = 100000; // Cleanup every 100k orders

            while (stats_.running)
            {
                auto batchStart = std::chrono::high_resolution_clock::now();

                for (uint64_t i = 0; i < BATCH_SIZE && stats_.running; ++i)
                {
                    // Determine trader type for this order (weighted distribution)
                    TraderType trader = selectTraderType();

                    // Generate order based on trader persona
                    generateHumanLikeOrder(trader);

                    // Cancel old orders more aggressively (50% chance per order)
                    if (uniformDist_(rng_) < 0.50 && !pendingOrderIds_.empty())
                    {
                        cancelOldOrders();
                    }

                    orderCount++;
                    stats_.ordersGenerated++;

                    if (priceCallback_ && (orderCount - lastCallback) >= callbackInterval_)
                    {
                        priceCallback_(currentPrice_, orderCount);
                        lastCallback = orderCount;
                    }
                }

                // Update volatility estimate
                updateVolatility();

                // Periodic cleanup to prevent memory bloat
                if (orderCount - lastCleanup > CLEANUP_INTERVAL)
                {
                    cleanupStaleOrders();
                    lastCleanup = orderCount;
                }

                auto batchEnd = std::chrono::high_resolution_clock::now();
                
                // Rolling OPS calculation (last 2 seconds window)
                opsWindow_.push_back({orderCount, batchEnd});
                while (!opsWindow_.empty()) {
                    auto age = std::chrono::duration<double>(batchEnd - opsWindow_.front().second).count();
                    if (age > 2.0) {
                        opsWindow_.pop_front();
                    } else {
                        break;
                    }
                }
                
                if (opsWindow_.size() >= 2) {
                    uint64_t ordersInWindow = orderCount - opsWindow_.front().first;
                    double windowTime = std::chrono::duration<double>(batchEnd - opsWindow_.front().second).count();
                    if (windowTime > 0.1) {
                        stats_.ordersPerSecond = static_cast<double>(ordersInWindow) / windowTime;
                    }
                }

                auto elapsed = std::chrono::duration<double>(batchEnd - startTime).count();
                double expectedTime = static_cast<double>(orderCount) / targetOPS_;
                if (elapsed < expectedTime)
                {
                    auto sleepTime = std::chrono::duration<double>(expectedTime - elapsed);
                    std::this_thread::sleep_for(sleepTime);
                }

                stats_.tradesExecuted = book_.getTradeCount();
            }
        }

        TraderType selectTraderType()
        {
            double r = uniformDist_(rng_);
            if (r < 0.40)
                return TraderType::MARKET_MAKER; // 40% - provides liquidity
            if (r < 0.60)
                return TraderType::RETAIL; // 20% - retail traders
            if (r < 0.75)
                return TraderType::INSTITUTIONAL; // 15% - big players
            if (r < 0.90)
                return TraderType::ALGO_MOMENTUM; // 15% - trend followers
            return TraderType::ALGO_MEAN_REVERT;  // 10% - contrarians
        }

        void generateHumanLikeOrder(TraderType trader)
        {
            // Realistic price evolution with Ornstein-Uhlenbeck process
            double noise = normalDist_(rng_) * realizedVolatility_ * currentPrice_;
            double drift = momentum_ * currentPrice_ * 0.0001;
            double meanReversion = (basePrice_ - currentPrice_) * 0.00005;

            currentPrice_ += noise + drift + meanReversion;

            // Clamp price to realistic range (±10% from base)
            double minPrice = basePrice_ * 0.90;
            double maxPrice = basePrice_ * 1.10;
            currentPrice_ = std::max(minPrice, std::min(maxPrice, currentPrice_));

            // Update VWAP
            vwap_ = vwap_ * 0.999 + currentPrice_ * 0.001;

            // Track price history
            priceHistory_.push_back(currentPrice_);
            if (priceHistory_.size() > 1000)
            {
                priceHistory_.pop_front();
            }

            // Update stats
            stats_.currentPrice = currentPrice_;
            if (currentPrice_ > stats_.highPrice)
                stats_.highPrice = currentPrice_;
            if (currentPrice_ < stats_.lowPrice)
                stats_.lowPrice = currentPrice_;

            // Generate order based on trader type
            Side side;
            double price, size;

            switch (trader)
            {
            case TraderType::MARKET_MAKER:
                generateMarketMakerOrder(side, price, size);
                break;
            case TraderType::RETAIL:
                generateRetailOrder(side, price, size);
                break;
            case TraderType::INSTITUTIONAL:
                generateInstitutionalOrder(side, price, size);
                break;
            case TraderType::ALGO_MOMENTUM:
                generateMomentumOrder(side, price, size);
                break;
            case TraderType::ALGO_MEAN_REVERT:
                generateMeanRevertOrder(side, price, size);
                break;
            }

            // Update order flow tracking
            if (side == Side::BID)
            {
                consecutiveBuys_++;
                consecutiveSells_ = 0;
                buyPressure_ = buyPressure_ * 0.99 + 0.01;
                totalBuyVolume_ += size;
            }
            else
            {
                consecutiveSells_++;
                consecutiveBuys_ = 0;
                buyPressure_ = buyPressure_ * 0.99;
                totalSellVolume_ += size;
            }

            // Update momentum based on order flow imbalance
            momentum_ = (buyPressure_ - 0.5) * 2.0;

            // Update stats for telemetry
            stats_.vwap = vwap_;
            stats_.buyVolume = totalBuyVolume_;
            stats_.sellVolume = totalSellVolume_;
            stats_.cumulativeDelta = totalBuyVolume_ - totalSellVolume_;

            uint64_t orderId = book_.addOrder(side, price, size);

            // Track orders for potential cancellation (if not immediately filled)
            if (orderId > 0 && pendingOrderIds_.size() < 50000)
            {
                pendingOrderIds_.push_back(orderId);
            }
        }

        void generateMarketMakerOrder(Side &side, double &price, double &size)
        {
            // Market makers quote both sides, tight spreads
            double spread = currentPrice_ * 0.0001 * (1.0 + uniformDist_(rng_) * 2.0); // 1-3 bps

            // Slightly favor the side with less pressure
            side = uniformDist_(rng_) < (1.0 - buyPressure_) ? Side::BID : Side::ASK;

            if (side == Side::BID)
            {
                price = currentPrice_ - spread * (0.5 + uniformDist_(rng_) * 0.5);
            }
            else
            {
                price = currentPrice_ + spread * (0.5 + uniformDist_(rng_) * 0.5);
            }

            // Medium size, consistent
            size = 0.1 + uniformDist_(rng_) * 0.4; // 0.1 - 0.5 BTC
        }

        void generateRetailOrder(Side &side, double &price, double &size)
        {
            // Retail traders are emotional, chase momentum
            if (momentum_ > 0.1)
            {
                side = uniformDist_(rng_) < 0.7 ? Side::BID : Side::ASK; // FOMO buying
            }
            else if (momentum_ < -0.1)
            {
                side = uniformDist_(rng_) < 0.7 ? Side::ASK : Side::BID; // Panic selling
            }
            else
            {
                side = uniformDist_(rng_) < 0.5 ? Side::BID : Side::ASK;
            }

            // Often use market orders (cross the spread)
            double aggressiveness = uniformDist_(rng_);
            if (aggressiveness < 0.3)
            {
                // Aggressive market order
                price = side == Side::BID
                            ? currentPrice_ + currentPrice_ * 0.001
                            : currentPrice_ - currentPrice_ * 0.001;
            }
            else
            {
                // Limit order near the market
                double offset = currentPrice_ * 0.0002 * (1.0 + uniformDist_(rng_) * 5.0);
                price = side == Side::BID ? currentPrice_ - offset : currentPrice_ + offset;
            }

            // Small size, round numbers preferred
            double rawSize = 0.001 + uniformDist_(rng_) * 0.1;
            size = std::round(rawSize * 1000) / 1000; // Round to 3 decimals
        }

        void generateInstitutionalOrder(Side &side, double &price, double &size)
        {
            // Institutional traders are patient, contrarian
            side = buyPressure_ > 0.55 ? Side::ASK : Side::BID; // Fade the crowd

            // Deep limit orders, patient
            double offset = currentPrice_ * 0.0005 * (1.0 + uniformDist_(rng_) * 4.0);
            price = side == Side::BID ? currentPrice_ - offset : currentPrice_ + offset;

            // Larger but not huge (iceberg style - hide real size)
            size = 0.5 + uniformDist_(rng_) * 1.5; // 0.5 - 2.0 BTC
        }

        void generateMomentumOrder(Side &side, double &price, double &size)
        {
            // Algo follows short-term momentum
            double shortMomentum = 0;
            if (priceHistory_.size() >= 10)
            {
                shortMomentum = (priceHistory_.back() - priceHistory_[priceHistory_.size() - 10]) / priceHistory_[priceHistory_.size() - 10];
            }

            if (shortMomentum > 0.0001)
            {
                side = Side::BID;
            }
            else if (shortMomentum < -0.0001)
            {
                side = Side::ASK;
            }
            else
            {
                side = uniformDist_(rng_) < 0.5 ? Side::BID : Side::ASK;
            }

            // Aggressive execution
            double offset = currentPrice_ * 0.0001 * uniformDist_(rng_);
            price = side == Side::BID
                        ? currentPrice_ + offset // Cross spread to get filled
                        : currentPrice_ - offset;

            size = 0.05 + uniformDist_(rng_) * 0.2; // Quick, small trades
        }

        void generateMeanRevertOrder(Side &side, double &price, double &size)
        {
            // Fade moves away from VWAP
            double deviation = (currentPrice_ - vwap_) / vwap_;

            if (deviation > 0.001)
            {
                side = Side::ASK; // Price above VWAP, sell
            }
            else if (deviation < -0.001)
            {
                side = Side::BID; // Price below VWAP, buy
            }
            else
            {
                side = uniformDist_(rng_) < 0.5 ? Side::BID : Side::ASK;
            }

            // Limit orders at favorable prices
            double offset = currentPrice_ * 0.0003 * (1.0 + uniformDist_(rng_) * 2.0);
            price = side == Side::BID ? currentPrice_ - offset : currentPrice_ + offset;

            size = 0.1 + uniformDist_(rng_) * 0.3;
        }

        void cancelOldOrders()
        {
            // Cancel more aggressively to keep book size manageable
            size_t toCancel = std::min(pendingOrderIds_.size(), static_cast<size_t>(10));

            for (size_t i = 0; i < toCancel && !pendingOrderIds_.empty(); ++i)
            {
                uint64_t orderId = pendingOrderIds_.front();
                pendingOrderIds_.pop_front();

                if (book_.cancelOrder(orderId))
                {
                    stats_.ordersCancelled++;
                }
            }
        }
        
        void cleanupStaleOrders()
        {
            // Aggressively cancel old orders to prevent memory bloat
            size_t targetSize = 1000; // Keep only recent 1000 orders tracked
            while (pendingOrderIds_.size() > targetSize)
            {
                uint64_t orderId = pendingOrderIds_.front();
                pendingOrderIds_.pop_front();
                if (book_.cancelOrder(orderId))
                {
                    stats_.ordersCancelled++;
                }
            }
        }

        void updateVolatility()
        {
            if (priceHistory_.size() < 100)
                return;

            // Calculate realized volatility from recent price history
            double sumSquaredReturns = 0.0;
            for (size_t i = priceHistory_.size() - 100; i < priceHistory_.size() - 1; ++i)
            {
                double ret = (priceHistory_[i + 1] - priceHistory_[i]) / priceHistory_[i];
                sumSquaredReturns += ret * ret;
            }

            realizedVolatility_ = std::sqrt(sumSquaredReturns / 99.0);
            realizedVolatility_ = std::max(0.0001, std::min(0.001, realizedVolatility_)); // Clamp

            stats_.volatility = realizedVolatility_ * 100; // As percentage
        }
    };

} // namespace hyperion
