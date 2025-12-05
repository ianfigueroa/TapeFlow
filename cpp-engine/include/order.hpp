// Order struct - optimized for cache efficiency (32 bytes)

#pragma once

#include <cstdint>

namespace hyperion {

enum class Side : uint8_t {
    BID = 0,
    ASK = 1
};

// Packed struct for memory efficiency
// Total: 32 bytes (cache-line friendly)
struct Order {
    uint64_t id;           // Unique order ID
    uint64_t timestamp;    // Nanosecond timestamp
    double   price;        // Limit price
    double   quantity;     // Remaining quantity
    Side     side;         // Bid or Ask
    uint8_t  padding[7];   // Align to 32 bytes
    
    Order() = default;
    
    Order(uint64_t id_, Side side_, double price_, double qty_, uint64_t ts_)
        : id(id_), timestamp(ts_), price(price_), quantity(qty_), side(side_) {}
    
    bool isBid() const { return side == Side::BID; }
    bool isAsk() const { return side == Side::ASK; }
    bool isFilled() const { return quantity <= 0.0; }
};

// Trade result from matching
struct Trade {
    uint64_t bidOrderId;
    uint64_t askOrderId;
    double   price;
    double   quantity;
    uint64_t timestamp;
};

} // namespace hyperion
