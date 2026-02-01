// Telemetry server - broadcasts market data to frontend via WebSocket

#pragma once

#include "websocket.hpp"
#include "orderbook.hpp"
#include "simulator.hpp"
#include <sstream>
#include <iomanip>
#include <chrono>
#include <thread>
#include <cstring>
#include <cstdlib>

namespace hyperion
{

    class TelemetryServer
    {
    public:
        TelemetryServer(uint16_t port = 9001)
            : wsServer_(port), running_(false), broadcastIntervalMs_(50) // 20 updates/sec
        {
        }

        bool start(OrderBook &book, MarketSimulator &simulator)
        {
            book_ = &book;
            simulator_ = &simulator;

            // Set up message handler for configuration commands
            wsServer_.setMessageHandler([this](const std::string &msg)
                                        { handleIncomingMessage(msg); });

            if (!wsServer_.start())
            {
                return false;
            }

            running_ = true;
            broadcastThread_ = std::thread(&TelemetryServer::broadcastLoop, this);
            return true;
        }

        void stop()
        {
            running_ = false;
            if (broadcastThread_.joinable())
            {
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
        OrderBook *book_ = nullptr;
        MarketSimulator *simulator_ = nullptr;
        std::atomic<bool> running_;
        std::thread broadcastThread_;
        uint32_t broadcastIntervalMs_;

        // Simple JSON value extraction (minimal implementation, no external deps)
        double extractDouble(const std::string &json, const std::string &key)
        {
            std::string searchKey = "\"" + key + "\":";
            size_t pos = json.find(searchKey);
            if (pos == std::string::npos)
                return -1.0;
            pos += searchKey.length();
            // Skip whitespace
            while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t'))
                pos++;
            size_t end = pos;
            while (end < json.length() && (isdigit(json[end]) || json[end] == '.' || json[end] == '-'))
                end++;
            if (end > pos)
            {
                return std::stod(json.substr(pos, end - pos));
            }
            return -1.0;
        }

        std::string extractString(const std::string &json, const std::string &key)
        {
            std::string searchKey = "\"" + key + "\":\"";
            size_t pos = json.find(searchKey);
            if (pos == std::string::npos)
                return "";
            pos += searchKey.length();
            size_t end = json.find("\"", pos);
            if (end == std::string::npos)
                return "";
            return json.substr(pos, end - pos);
        }

        void handleIncomingMessage(const std::string &message)
        {
            if (!simulator_ || message.empty())
                return;

            // Check message type
            std::string type = extractString(message, "type");

            if (type == "configure")
            {
                // Handle configuration updates
                std::string param = extractString(message, "param");
                double value = extractDouble(message, "value");

                if (param == "targetOPS" && value > 0)
                {
                    simulator_->setTargetOPS(static_cast<uint64_t>(value));
                }
                else if (param == "basePrice" && value > 0)
                {
                    simulator_->setBasePrice(value);
                }
                else if (param == "volatility" && value > 0)
                {
                    simulator_->setVolatilityMultiplier(value);
                }
                else if (param == "momentum" && value >= 0)
                {
                    simulator_->setMomentumStrength(value);
                }
                else if (param == "broadcastInterval" && value >= 10)
                {
                    broadcastIntervalMs_ = static_cast<uint32_t>(value);
                }

                // Send acknowledgment
                std::ostringstream ack;
                ack << "{\"type\":\"configAck\",\"param\":\"" << param << "\",\"value\":" << value << "}";
                wsServer_.broadcast(ack.str());
            }
            else if (type == "getConfig")
            {
                // Send current configuration
                auto config = simulator_->getConfig();
                std::ostringstream json;
                json << std::fixed << std::setprecision(2);
                json << "{\"type\":\"config\",";
                json << "\"targetOPS\":" << config.targetOPS << ",";
                json << "\"basePrice\":" << config.basePrice << ",";
                json << "\"volatilityMultiplier\":" << std::setprecision(4) << config.volatilityMultiplier << ",";
                json << "\"momentumStrength\":" << config.momentumStrength << ",";
                json << "\"meanReversionStrength\":" << std::setprecision(6) << config.meanReversionStrength << ",";
                json << "\"broadcastIntervalMs\":" << broadcastIntervalMs_ << ",";
                json << "\"traderDistribution\":{";
                json << "\"marketMaker\":" << std::setprecision(2) << config.marketMakerPct << ",";
                json << "\"retail\":" << config.retailPct << ",";
                json << "\"institutional\":" << config.institutionalPct << ",";
                json << "\"algoMomentum\":" << config.algoMomentumPct << ",";
                json << "\"algoMeanRevert\":" << config.algoMeanRevertPct;
                json << "}}";
                wsServer_.broadcast(json.str());
            }
        }

        void broadcastLoop()
        {
            while (running_)
            {
                auto start = std::chrono::steady_clock::now();

                if (wsServer_.getClientCount() > 0)
                {
                    std::string json = buildTelemetryJSON();
                    wsServer_.broadcast(json);
                }

                auto elapsed = std::chrono::steady_clock::now() - start;
                auto sleepTime = std::chrono::milliseconds(broadcastIntervalMs_) - elapsed;
                if (sleepTime.count() > 0)
                {
                    std::this_thread::sleep_for(sleepTime);
                }
            }
        }

        std::string buildTelemetryJSON()
        {
            const auto &stats = simulator_->getStats();
            auto now = std::chrono::system_clock::now();
            auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                                 now.time_since_epoch())
                                 .count();

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
            json << "\"vwap\":" << stats.vwap.load() << ",";

            // Order flow data
            json << "\"cumulativeDelta\":" << std::setprecision(4) << stats.cumulativeDelta.load() << ",";
            json << "\"buyVolume\":" << stats.buyVolume.load() << ",";
            json << "\"sellVolume\":" << stats.sellVolume.load() << ",";

            // Order book
            json << std::setprecision(2);
            json << "\"bestBid\":" << book_->getBestBid() << ",";
            json << "\"bestAsk\":" << book_->getBestAsk() << ",";
            json << "\"spread\":" << book_->getSpread() << ",";
            json << "\"midPrice\":" << book_->getMidPrice() << ",";

            // Performance stats
            json << "\"ordersPerSecond\":" << std::setprecision(0) << stats.ordersPerSecond.load() << ",";
            json << "\"totalOrders\":" << stats.ordersGenerated.load() << ",";
            json << "\"totalTrades\":" << stats.tradesExecuted.load() << ",";
            json << "\"volatility\":" << std::setprecision(6) << stats.volatility.load() << ",";

            // Order book depth (top 10 levels)
            json << "\"bids\":[";
            auto bids = book_->getTopBids(10);
            for (size_t i = 0; i < bids.size(); ++i)
            {
                if (i > 0)
                    json << ",";
                json << std::setprecision(2);
                json << "{\"price\":" << bids[i].first << ",\"size\":" << std::setprecision(4) << bids[i].second << "}";
            }
            json << "],";

            json << "\"asks\":[";
            auto asks = book_->getTopAsks(10);
            for (size_t i = 0; i < asks.size(); ++i)
            {
                if (i > 0)
                    json << ",";
                json << std::setprecision(2);
                json << "{\"price\":" << asks[i].first << ",\"size\":" << std::setprecision(4) << asks[i].second << "}";
            }
            json << "]";

            json << "}";

            return json.str();
        }
    };

} // namespace hyperion
