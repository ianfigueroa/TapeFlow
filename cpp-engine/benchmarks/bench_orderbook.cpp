// Direct order-book microbench (no simulator, no sleeps).
//
// The simulator in src/main.cpp is rate-limited for a readable console feed, so
// it is not a throughput measurement. This bench drives OrderBook directly to
// measure matching-engine throughput. Run in isolation for stable numbers:
//
//   ./bench_orderbook [N]     (default N = 10,000,000 ops per phase)
//
// The order book is mutex-guarded (single-threaded here), not lock-free.
//
#include "orderbook.hpp"

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>

using namespace hyperion;

// xorshift64 — cheap, deterministic PRNG so runs are reproducible.
static inline std::uint64_t next_rand(std::uint64_t& s) {
    s ^= s << 13;
    s ^= s >> 7;
    s ^= s << 17;
    return s;
}

int main(int argc, char** argv) {
    const std::uint64_t n = (argc > 1) ? std::strtoull(argv[1], nullptr, 10)
                                       : 10'000'000ULL;
    const double mid = 30000.0;

    // Phase A: mixed workload — 35% rest bid, 35% rest ask, 15% marketable, 15% cancel.
    {
        OrderBook book("BTCUSDT");
        std::vector<std::uint64_t> live;
        live.reserve(1 << 20);
        std::uint64_t s = 0x9E3779B97F4A7C15ULL;

        const auto start = std::chrono::steady_clock::now();
        for (std::uint64_t i = 0; i < n; ++i) {
            const unsigned r = static_cast<unsigned>(next_rand(s) % 100);
            if (r < 35) {
                const double px = mid - 1.0 - static_cast<double>(next_rand(s) % 500);
                if (std::uint64_t id = book.addOrder(Side::BID, px, 1.0)) live.push_back(id);
            } else if (r < 70) {
                const double px = mid + 1.0 + static_cast<double>(next_rand(s) % 500);
                if (std::uint64_t id = book.addOrder(Side::ASK, px, 1.0)) live.push_back(id);
            } else if (r < 85) {
                if (next_rand(s) & 1) book.addOrder(Side::ASK, mid - 600.0, 1.0);
                else                  book.addOrder(Side::BID, mid + 600.0, 1.0);
            } else if (!live.empty()) {
                const std::size_t idx = static_cast<std::size_t>(next_rand(s) % live.size());
                book.cancelOrder(live[idx]);
                live[idx] = live.back();
                live.pop_back();
            }
        }
        const auto end = std::chrono::steady_clock::now();
        const double ns = std::chrono::duration<double, std::nano>(end - start).count();
        std::printf("LOB mixed:    N=%llu  %.3fs  %.2f M ops/s  %.1f ns/op  trades=%llu\n",
                    static_cast<unsigned long long>(n), ns / 1e9,
                    static_cast<double>(n) / (ns / 1e9) / 1e6, ns / static_cast<double>(n),
                    static_cast<unsigned long long>(book.getTradeCount()));
    }

    // Phase B: add-only peak — non-crossing resting inserts, no matching/cancels.
    {
        OrderBook book("BTCUSDT");
        std::uint64_t s = 0x1234567890ABCDEFULL;
        const auto start = std::chrono::steady_clock::now();
        for (std::uint64_t i = 0; i < n; ++i) {
            if (i & 1) book.addOrder(Side::BID, mid - 1.0 - static_cast<double>(next_rand(s) % 2000), 1.0);
            else       book.addOrder(Side::ASK, mid + 1.0 + static_cast<double>(next_rand(s) % 2000), 1.0);
        }
        const auto end = std::chrono::steady_clock::now();
        const double ns = std::chrono::duration<double, std::nano>(end - start).count();
        std::printf("LOB add-only: N=%llu  %.3fs  %.2f M ops/s  %.1f ns/op  orders=%llu\n",
                    static_cast<unsigned long long>(n), ns / 1e9,
                    static_cast<double>(n) / (ns / 1e9) / 1e6, ns / static_cast<double>(n),
                    static_cast<unsigned long long>(book.getOrderCount()));
    }
    return 0;
}
