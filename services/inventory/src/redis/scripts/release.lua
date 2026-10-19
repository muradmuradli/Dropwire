-- Gives back whatever reserve.lua actually decremented for this order, if anything.
-- Idempotent: a repeated release for the same order_id is a no-op (guarded by the
-- cached reservation's own `released` flag), and releasing an order that was never
-- reserved (not found, out of stock, product not found) is a no-op too.
--
-- ARGV[1] = orderId

local orderId = ARGV[1]
local reservationKey = "reservation:" .. orderId

local cached = redis.call("GET", reservationKey)
if not cached then
  return cjson.encode({ released = true })
end

local data = cjson.decode(cached)
if data.released then
  return cjson.encode({ released = true })
end

if data.status == "RESERVED" then
  for productId, quantity in pairs(data.reserved) do
    redis.call("INCRBY", "stock:" .. productId, quantity)
  end
end

data.released = true
redis.call("SET", reservationKey, cjson.encode(data))
return cjson.encode({ released = true })
