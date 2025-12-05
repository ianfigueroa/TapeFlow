// Limit Order Book with price-time priority matching

#pragma once

#include "order.hpp"
#include <map>
#include <list>
#include <unordered_map>
#include <vector>
#include <functional>
#include <chrono>

namespace hyperion {

// Price level containing orders at same price (FIFO queue)
using OrderQueue = std::list<Order>;

class OrderBook {
public:
    using TradeCallback = std::function<void(const Trade&)>;
    
    OrderBook(const std::string& symbol = "BTCUSDT") 
        : symbol_(symbol), nextOrderId_(1), lastPrice_(0.0) {}
    
    // Add order and attempt matching
    // Returns order ID (0 if fully filled immediately)
    uint64_t addOrder(Side side, double price, double quantity) {
        auto now = std::chrono::high_resolution_clock::now().time_since_epoch().count();
        Order order(nextOrderId_++, side, price, quantity, now);
        
        // Attempt to match against opposite side
        match(order);
        
        // If order has remaining quantity, add to book
        if (!order.isFilled()) {
            addToBook(order);
            return order.id;
        }
        
        return 0; // Fully filled
    }
    
    // Cancel order by ID
    bool cancelOrder(uint64_t orderId) {
        auto it = orderIndex_.find(orderId);
        if (it == orderIndex_.end()) return false;
        
        Order& order = *(it->second.iterator);
        auto& levels = order.isBid() ? bids_ : asks_;
        auto levelIt = levels.find(order.price);
        
        if (levelIt != levels.end()) {
            levelIt->second.erase(it->second.iterator);
            if (levelIt->second.empty()) {
                levels.erase(levelIt);
            }
        }
        
        orderIndex_.erase(it);
        return true;
    }
    
    // Market data getters
    double getBestBid() const {
        return bids_.empty() ? 0.0 : bids_.rbegin()->first;
    }
    
    double getBestAsk() const {
        return asks_.empty() ? 0.0 : asks_.begin()->first;
    }
    
    double getSpread() const {
        double bid = getBestBid();
        double ask = getBestAsk();
        return (bid > 0 && ask > 0) ? ask - bid : 0.0;
    }
    
    double getMidPrice() const {
        double bid = getBestBid();
        double ask = getBestAsk();
        return (bid > 0 && ask > 0) ? (bid + ask) / 2.0 : lastPrice_;
    }
    
    double getLastPrice() const { return lastPrice_; }
    
    // Get top N levels for each side
    std::vector<std::pair<double, double>> getTopBids(size_t n) const {
        std::vector<std::pair<double, double>> result;
        result.reserve(n);
        size_t count = 0;
        for (auto it = bids_.rbegin(); it != bids_.rend() && count < n; ++it, ++count) {
            double totalQty = 0.0;
            for (const auto& order : it->second) {
                totalQty += order.quantity;
            }
            result.emplace_back(it->first, totalQty);
        }
        return result;
    }
    
    std::vector<std::pair<double, double>> getTopAsks(size_t n) const {
        std::vector<std::pair<double, double>> result;
        result.reserve(n);
        size_t count = 0;
        for (auto it = asks_.begin(); it != asks_.end() && count < n; ++it, ++count) {
            double totalQty = 0.0;
            for (const auto& order : it->second) {
                totalQty += order.quantity;
            }
            result.emplace_back(it->first, totalQty);
        }
        return result;
    }
    
    // Stats
    size_t getBidLevels() const { return bids_.size(); }
    size_t getAskLevels() const { return asks_.size(); }
    uint64_t getTradeCount() const { return tradeCount_; }
    uint64_t getOrderCount() const { return nextOrderId_ - 1; }
    
    // Set callback for trade notifications
    void setTradeCallback(TradeCallback cb) { tradeCallback_ = std::move(cb); }
    
    // Clear the book
    void clear() {
        bids_.clear();
        asks_.clear();
        orderIndex_.clear();
        tradeCount_ = 0;
    }
    
private:
    // Bids: highest price first (reverse order)
    // Asks: lowest price first (natural order)
    std::map<double, OrderQueue, std::greater<double>> bids_;
    std::map<double, OrderQueue> asks_;
    
    // Fast lookup by order ID
    struct OrderLocation {
        OrderQueue::iterator iterator;
    };
    std::unordered_map<uint64_t, OrderLocation> orderIndex_;
    
    std::string symbol_;
    uint64_t nextOrderId_;
    uint64_t tradeCount_ = 0;
    double lastPrice_;
    TradeCallback tradeCallback_;
    
    void match(Order& incomingOrder) {
        if (incomingOrder.isBid()) {
            matchBid(incomingOrder);
        } else {
            matchAsk(incomingOrder);
        }
    }
    
    void matchBid(Order& bid) {
        // Match against asks (lowest first)
        while (!bid.isFilled() && !asks_.empty()) {
            auto& [askPrice, askQueue] = *asks_.begin();
            
            // No match if bid price < best ask
            if (bid.price < askPrice) break;
            
            while (!bid.isFilled() && !askQueue.empty()) {
                Order& ask = askQueue.front();
                double fillQty = std::min(bid.quantity, ask.quantity);
                double fillPrice = ask.price; // Price-time priority: maker's price
                
                executeTrade(bid.id, ask.id, fillPrice, fillQty);
                
                bid.quantity -= fillQty;
                ask.quantity -= fillQty;
                
                if (ask.isFilled()) {
                    orderIndex_.erase(ask.id);
                    askQueue.pop_front();
                }
            }
            
            if (askQueue.empty()) {
                asks_.erase(asks_.begin());
            }
        }
    }
    
    void matchAsk(Order& ask) {
        // Match against bids (highest first)
        while (!ask.isFilled() && !bids_.empty()) {
            auto& [bidPrice, bidQueue] = *bids_.begin();
            
            // No match if ask price > best bid
            if (ask.price > bidPrice) break;
            
            while (!ask.isFilled() && !bidQueue.empty()) {
                Order& bid = bidQueue.front();
                double fillQty = std::min(ask.quantity, bid.quantity);
                double fillPrice = bid.price; // Price-time priority: maker's price
                
                executeTrade(bid.id, ask.id, fillPrice, fillQty);
                
                ask.quantity -= fillQty;
                bid.quantity -= fillQty;
                
                if (bid.isFilled()) {
                    orderIndex_.erase(bid.id);
                    bidQueue.pop_front();
                }
            }
            
            if (bidQueue.empty()) {
                bids_.erase(bids_.begin());
            }
        }
    }
    
    void executeTrade(uint64_t bidId, uint64_t askId, double price, double qty) {
        lastPrice_ = price;
        tradeCount_++;
        
        if (tradeCallback_) {
            auto now = std::chrono::high_resolution_clock::now().time_since_epoch().count();
            tradeCallback_(Trade{bidId, askId, price, qty, static_cast<uint64_t>(now)});
        }
    }
    
    void addToBook(Order& order) {
        auto& levels = order.isBid() ? bids_ : asks_;
        auto& queue = levels[order.price];
        queue.push_back(order);
        orderIndex_[order.id] = {std::prev(queue.end())};
    }
};

} // namespace hyperion
