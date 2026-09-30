local profile_collection = "com.marginalia.profile"

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

  local bindings = { profile_collection }
  local placeholders = {}
  for _, did in ipairs(dids) do
    table.insert(bindings, did)
    table.insert(placeholders, "$" .. #bindings)
  end

  local rows = db.raw(
    "SELECT uri, record FROM happyview_records WHERE collection = $1 AND did IN (" ..
      table.concat(placeholders, ", ") ..
      ")",
    bindings
  )
  local records = {}
  for _, row in ipairs(rows) do
    local record = row.record
    if type(record) == "string" then
      record = json.decode(record)
    end
    if type(record) == "table" and type(row.uri) == "string" then
      local profile = {
        uri = row.uri,
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

  return { records = toarray(records) }
end
