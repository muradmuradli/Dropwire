-- Atomically checks and (if every item has enough stock) reserves a whole order's worth
-- of stock in one round trip. All-or-nothing per docs/decisions/0007: either every item is
-- decremented, or nothing is.
--
-- Idempotent on order_id: a repeated call for an order that already ran this script returns
-- the cached result instead of re-checking/re-decrementing stock.
--
-- ARGV[1] = orderId
-- ARGV[2] = JSON array of { productId, quantity }, the items being reserved

local orderId = ARGV[1]
local items = cjson.decode(ARGV[2])

local reservationKey = "reservation:" .. orderId
local cached = redis.call("GET", reservationKey)
if cached then
  return cached
end

local results = {}
local anyNotFound = false
local anyOutOfStock = false

for i, item in ipairs(items) do
  local stockKey = "stock:" .. item.productId
  if redis.call("EXISTS", stockKey) == 0 then
    anyNotFound = true
    results[i] = { productId = item.productId, quantity = item.quantity, status = "PRODUCT_NOT_FOUND", availableQuantity = 0 }
  else
    local available = tonumber(redis.call("GET", stockKey))
    if available < item.quantity then
      anyOutOfStock = true
      results[i] = { productId = item.productId, quantity = item.quantity, status = "OUT_OF_STOCK", availableQuantity = available }
    else
      results[i] = { productId = item.productId, quantity = item.quantity, status = "RESERVED", availableQuantity = available }
    end
  end
end

local overallStatus
if anyNotFound then
  overallStatus = "PRODUCT_NOT_FOUND"
elseif anyOutOfStock then
  overallStatus = "OUT_OF_STOCK"
else
  overallStatus = "RESERVED"
end

local reserved = {}
if overallStatus == "RESERVED" then
  for _, item in ipairs(items) do
    redis.call("DECRBY", "stock:" .. item.productId, item.quantity)
    reserved[item.productId] = item.quantity
  end
end

local payload = cjson.encode({ status = overallStatus, items = results, reserved = reserved, released = false })
redis.call("SET", reservationKey, payload)
return payload
