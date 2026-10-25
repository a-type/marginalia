local profile_collection = "com.marginsbible.profile"

local function query_all(did)
  local records = {}
  local request = {
    collection = profile_collection,
    did = did,
    limit = 100,
  }
  local cursors = {}

  while true do
    local page = db.query(request)
    for _, record in ipairs(page.records) do
      table.insert(records, record)
    end
    if not page.cursor then
      break
    end
    if cursors[page.cursor] then
      error("HappyView returned a repeated record cursor")
    end
    cursors[page.cursor] = true
    request.cursor = page.cursor
  end

  return records
end

function handle()
  local dids = {}
  local seen = {}
  for did in string.gmatch(params.dids or "", "[^,]+") do
    if not string.match(did, "^did:[%w%.:%-]+$") then
      error("Invalid DID")
    end
    if not seen[did] then
      seen[did] = true
      table.insert(dids, did)
    end
  end

  if #dids > 100 then
    error("At most 100 DIDs may be requested")
  end
  if #dids == 0 then
    return { records = toarray({}) }
  end

  local records = {}
  for _, did in ipairs(dids) do
    for _, record in ipairs(query_all(did)) do
      if type(record) == "table" and type(record.uri) == "string" then
        local profile = {
          uri = record.uri,
          handle = record.handle,
          createdAt = record.createdAt,
        }
        if type(record.displayName) == "string" then
          profile.displayName = record.displayName
        end
        if type(record.avatar) == "string" then
          profile.avatar = record.avatar
        end
        if type(record.description) == "string" then
          profile.description = record.description
        end
        table.insert(records, profile)
      end
    end
  end

  return { records = toarray(records) }
end
