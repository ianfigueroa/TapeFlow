// Minimal WebSocket server - header-only implementation
// Based on RFC 6455, supports text frames only (sufficient for JSON telemetry)

#pragma once

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using socket_t = SOCKET;
#define SOCKET_ERROR_CODE WSAGetLastError()
#define CLOSE_SOCKET closesocket
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
using socket_t = int;
#define INVALID_SOCKET -1
#define SOCKET_ERROR -1
#define SOCKET_ERROR_CODE errno
#define CLOSE_SOCKET close
#endif

#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <mutex>
#include <functional>
#include <sstream>
#include <cstring>
#include <algorithm>

namespace hyperion
{

    // SHA-1 implementation for WebSocket handshake
    class SHA1
    {
    public:
        static std::string hash(const std::string &input)
        {
            uint32_t h0 = 0x67452301;
            uint32_t h1 = 0xEFCDAB89;
            uint32_t h2 = 0x98BADCFE;
            uint32_t h3 = 0x10325476;
            uint32_t h4 = 0xC3D2E1F0;

            std::string padded = input;
            size_t origLen = input.size();
            padded += static_cast<char>(0x80);
            while ((padded.size() % 64) != 56)
                padded += '\0';

            uint64_t bitLen = origLen * 8;
            for (int i = 7; i >= 0; --i)
            {
                padded += static_cast<char>((bitLen >> (i * 8)) & 0xFF);
            }

            for (size_t chunk = 0; chunk < padded.size(); chunk += 64)
            {
                uint32_t w[80];
                for (int i = 0; i < 16; ++i)
                {
                    w[i] = (static_cast<uint8_t>(padded[chunk + i * 4]) << 24) |
                           (static_cast<uint8_t>(padded[chunk + i * 4 + 1]) << 16) |
                           (static_cast<uint8_t>(padded[chunk + i * 4 + 2]) << 8) |
                           static_cast<uint8_t>(padded[chunk + i * 4 + 3]);
                }
                for (int i = 16; i < 80; ++i)
                {
                    w[i] = leftRotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
                }

                uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
                for (int i = 0; i < 80; ++i)
                {
                    uint32_t f, k;
                    if (i < 20)
                    {
                        f = (b & c) | ((~b) & d);
                        k = 0x5A827999;
                    }
                    else if (i < 40)
                    {
                        f = b ^ c ^ d;
                        k = 0x6ED9EBA1;
                    }
                    else if (i < 60)
                    {
                        f = (b & c) | (b & d) | (c & d);
                        k = 0x8F1BBCDC;
                    }
                    else
                    {
                        f = b ^ c ^ d;
                        k = 0xCA62C1D6;
                    }

                    uint32_t temp = leftRotate(a, 5) + f + e + k + w[i];
                    e = d;
                    d = c;
                    c = leftRotate(b, 30);
                    b = a;
                    a = temp;
                }
                h0 += a;
                h1 += b;
                h2 += c;
                h3 += d;
                h4 += e;
            }

            std::string result(20, '\0');
            for (int i = 0; i < 4; ++i)
            {
                result[i] = (h0 >> (24 - i * 8)) & 0xFF;
                result[4 + i] = (h1 >> (24 - i * 8)) & 0xFF;
                result[8 + i] = (h2 >> (24 - i * 8)) & 0xFF;
                result[12 + i] = (h3 >> (24 - i * 8)) & 0xFF;
                result[16 + i] = (h4 >> (24 - i * 8)) & 0xFF;
            }
            return result;
        }

    private:
        static uint32_t leftRotate(uint32_t x, int n)
        {
            return (x << n) | (x >> (32 - n));
        }
    };

    // Base64 encoder for handshake
    class Base64
    {
    public:
        static std::string encode(const std::string &input)
        {
            static const char *chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            std::string result;
            int val = 0, valb = -6;
            for (unsigned char c : input)
            {
                val = (val << 8) + c;
                valb += 8;
                while (valb >= 0)
                {
                    result += chars[(val >> valb) & 0x3F];
                    valb -= 6;
                }
            }
            if (valb > -6)
                result += chars[((val << 8) >> (valb + 8)) & 0x3F];
            while (result.size() % 4)
                result += '=';
            return result;
        }
    };

    class WebSocketServer
    {
    public:
        WebSocketServer(uint16_t port = 9001) : port_(port), running_(false) {}

        ~WebSocketServer() { stop(); }

        bool start()
        {
#ifdef _WIN32
            WSADATA wsaData;
            if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
                return false;
#endif

            serverSocket_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
            if (serverSocket_ == INVALID_SOCKET)
                return false;

            int opt = 1;
            setsockopt(serverSocket_, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<char *>(&opt), sizeof(opt));

            sockaddr_in addr{};
            addr.sin_family = AF_INET;
            addr.sin_addr.s_addr = INADDR_ANY;
            addr.sin_port = htons(port_);

            if (bind(serverSocket_, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) == SOCKET_ERROR)
            {
                CLOSE_SOCKET(serverSocket_);
                return false;
            }

            if (listen(serverSocket_, SOMAXCONN) == SOCKET_ERROR)
            {
                CLOSE_SOCKET(serverSocket_);
                return false;
            }

            running_ = true;
            acceptThread_ = std::thread(&WebSocketServer::acceptLoop, this);
            return true;
        }

        void stop()
        {
            running_ = false;
            if (serverSocket_ != INVALID_SOCKET)
            {
                CLOSE_SOCKET(serverSocket_);
                serverSocket_ = INVALID_SOCKET;
            }
            if (acceptThread_.joinable())
                acceptThread_.join();

            std::lock_guard<std::mutex> lock(clientsMutex_);
            for (auto &client : clients_)
            {
                CLOSE_SOCKET(client);
            }
            clients_.clear();

#ifdef _WIN32
            WSACleanup();
#endif
        }

        // Broadcast message to all connected clients
        void broadcast(const std::string &message)
        {
            std::vector<char> frame = createFrame(message);

            std::lock_guard<std::mutex> lock(clientsMutex_);
            auto it = clients_.begin();
            while (it != clients_.end())
            {
                int sent = send(*it, frame.data(), static_cast<int>(frame.size()), 0);
                if (sent == SOCKET_ERROR)
                {
                    CLOSE_SOCKET(*it);
                    it = clients_.erase(it);
                }
                else
                {
                    ++it;
                }
            }
        }

        size_t getClientCount() const
        {
            std::lock_guard<std::mutex> lock(clientsMutex_);
            return clients_.size();
        }

        bool isRunning() const { return running_; }
        uint16_t getPort() const { return port_; }

    private:
        uint16_t port_;
        socket_t serverSocket_ = INVALID_SOCKET;
        std::atomic<bool> running_;
        std::thread acceptThread_;
        std::vector<socket_t> clients_;
        mutable std::mutex clientsMutex_;

        void acceptLoop()
        {
            while (running_)
            {
                sockaddr_in clientAddr{};
                socklen_t clientLen = sizeof(clientAddr);
                socket_t clientSocket = accept(serverSocket_, reinterpret_cast<sockaddr *>(&clientAddr), &clientLen);

                if (clientSocket == INVALID_SOCKET)
                    continue;

                // Handle WebSocket handshake in separate thread
                std::thread([this, clientSocket]()
                            {
                if (performHandshake(clientSocket)) {
                    std::lock_guard<std::mutex> lock(clientsMutex_);
                    clients_.push_back(clientSocket);
                } else {
                    CLOSE_SOCKET(clientSocket);
                } })
                    .detach();
            }
        }

        bool performHandshake(socket_t client)
        {
            char buffer[4096];
            int received = recv(client, buffer, sizeof(buffer) - 1, 0);
            if (received <= 0)
                return false;
            buffer[received] = '\0';

            std::string request(buffer);

            // Extract Sec-WebSocket-Key
            std::string keyHeader = "Sec-WebSocket-Key: ";
            auto keyPos = request.find(keyHeader);
            if (keyPos == std::string::npos)
                return false;

            auto keyStart = keyPos + keyHeader.size();
            auto keyEnd = request.find("\r\n", keyStart);
            std::string key = request.substr(keyStart, keyEnd - keyStart);

            // Generate accept key
            std::string magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
            std::string acceptKey = Base64::encode(SHA1::hash(key + magic));

            // Send handshake response
            std::ostringstream response;
            response << "HTTP/1.1 101 Switching Protocols\r\n"
                     << "Upgrade: websocket\r\n"
                     << "Connection: Upgrade\r\n"
                     << "Sec-WebSocket-Accept: " << acceptKey << "\r\n"
                     << "\r\n";

            std::string resp = response.str();
            return send(client, resp.c_str(), static_cast<int>(resp.size()), 0) != SOCKET_ERROR;
        }

        std::vector<char> createFrame(const std::string &message)
        {
            std::vector<char> frame;
            frame.push_back(static_cast<char>(0x81)); // FIN + text frame

            size_t len = message.size();
            if (len <= 125)
            {
                frame.push_back(static_cast<char>(len));
            }
            else if (len <= 65535)
            {
                frame.push_back(126);
                frame.push_back(static_cast<char>((len >> 8) & 0xFF));
                frame.push_back(static_cast<char>(len & 0xFF));
            }
            else
            {
                frame.push_back(127);
                for (int i = 7; i >= 0; --i)
                {
                    frame.push_back(static_cast<char>((len >> (i * 8)) & 0xFF));
                }
            }

            frame.insert(frame.end(), message.begin(), message.end());
            return frame;
        }
    };

} // namespace hyperion
