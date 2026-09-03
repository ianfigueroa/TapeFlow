cmake_minimum_required(VERSION 3.16)
project(HyperionEngine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Optimization flags for release builds
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -march=native")

# Source files
set(SOURCES
    src/main.cpp
)

# Main executable
add_executable(hyperion ${SOURCES})

# Include directories
target_include_directories(hyperion PRIVATE ${CMAKE_SOURCE_DIR}/include)

# Platform-specific threading
if(WIN32)
    target_link_libraries(hyperion PRIVATE ws2_32)
else()
    find_package(Threads REQUIRED)
    target_link_libraries(hyperion PRIVATE Threads::Threads)
endif()

option(HYPERION_BUILD_BENCHMARKS "Build order-book microbenchmarks" ON)
if(HYPERION_BUILD_BENCHMARKS)
    add_executable(bench_orderbook benchmarks/bench_orderbook.cpp)
    target_include_directories(bench_orderbook PRIVATE ${CMAKE_SOURCE_DIR}/include)
    if(NOT WIN32)
        find_package(Threads REQUIRED)
        target_link_libraries(bench_orderbook PRIVATE Threads::Threads)
    endif()
endif()

message(STATUS "Hyperion Engine configured for ${CMAKE_SYSTEM_NAME}")
