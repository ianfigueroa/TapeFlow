// Telemetry server - broadcasts market data to frontend via WebSocket

#pragma once

#include "websocket.hpp"
#include "orderbook.hpp"
#include "simulator.hpp"
#include <sstream>
#include <iomanip>
#include <chrono>
#include <thread>

namespace hyperion {

class TelemetryServer {
public:
    TelemetryServer(uint16_t port = 9001) 
        : wsServer_(port)
        , running_(false)
        , broadcastIntervalMs_(50) // 20 updates/sec
    {}
    
    bool start(OrderBook& book, MarketSimulator& simulator) {
        book_ = &book;
        simulator_ = &simulator;
        
        if (!wsServer_.start()) {
            return false;
        }
        
        running_ = true;
        broadcastThread_ = std::thread(&TelemetryServer::broadcastLoop, this);
        return true;
    }
    
    void stop() {
        running_ = false;
        if (broadcastThread_.joinable()) {
            broadcastThread_.join();
        }
        wsServer_.stop();
    }
    
    void setBroadcastInterval(uint32_t ms) { broadcastIntervalMs_ = ms; }
    
    size_t getClientCount() const { return wsServer_.getClientCount(); }
    uint16_t getPort() const { return wsServer_.getPort(); }
    
    ~TelemetryServer() { stop(); }

private:
    WebSocketServer wsServer_;
    OrderBook* book_ = nullptr;
    MarketSimulator* simulator_ = nullptr;
    std::atomic<bool> running_;
    std::thread broadcastThread_;
    uint32_t broadcastIntervalMs_;
    
    void broadcastLoop() {
        while (running_) {
            auto start = std::chrono::steady_clock::now();
            
            if (wsServer_.getClientCount() > 0) {
                std::string json = buildTelemetryJSON();
                wsServer_.broadcast(json);
            }
            
            auto elapsed = std::chrono::steady_clock::now() - start;
            auto sleepTime = std::chrono::milliseconds(broadcastIntervalMs_) - elapsed;
            if (sleepTime.count() > 0) {
                std::this_thread::sleep_for(sleepTime);
            }
        }
    }
    
    std::string buildTelemetryJSON() {
        const auto& stats = simulator_->getStats();
        auto now = std::chrono::system_clock::now();
        auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()).count();
        
        std::ostringstream json;
        json << std::fixed << std::setprecision(2);
        
        json << "{";
        json << "\"type\":\"telemetry\",";
        json << "\"timestamp\":" << timestamp << ",";
        json << "\"symbol\":\"BTCUSDT\",";
        
        // Price data
        json << "\"price\":" << stats.currentPrice.load() << ",";
        json << "\"high\":" << stats.highPrice.load() << ",";
        json << "\"low\":" << stats.lowPrice.load() << ",";
        
        // Order book
        json << "\"bestBid\":" << book_->getBestBid() << ",";
        json << "\"bestAsk\":" << book_->getBestAsk() << ",";
        json << "\"spread\":" << book_->getSpread() << ",";
        json << "\"midPrice\":" << book_->getMidPrice() << ",";
        
        // Performance stats
        json << "\"ordersPerSecond\":" << std::setprecision(0) << stats.ordersPerSecond.load() << ",";
        json << "\"totalOrders\":" << stats.ordersGenerated.load() << ",";
        json << "\"totalTrades\":" << stats.tradesExecuted.load() << ",";
        
        // Order book depth (top 10 levels)
        json << "\"bids\":[";
        auto bids = book_->getTopBids(10);
        for (size_t i = 0; i < bids.size(); ++i) {
            if (i > 0) json << ",";
            json << std::setprecision(2);
            json << "{\"price\":" << bids[i].first << ",\"size\":" << std::setprecision(4) << bids[i].second << "}";
        }
        json << "],";
        
        json << "\"asks\":[";
        auto asks = book_->getTopAsks(10);
        for (size_t i = 0; i < asks.size(); ++i) {
            if (i > 0) json << ",";
            json << std::setprecision(2);
            json << "{\"price\":" << asks[i].first << ",\"size\":" << std::setprecision(4) << asks[i].second << "}";
        }
        json << "]";
        
        json << "}";
        
        return json.str();
    }
};

} // namespace hyperion
