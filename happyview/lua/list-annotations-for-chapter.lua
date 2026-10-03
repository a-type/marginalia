local annotation_collection = "com.apsotilbible.annotation"
local follow_collection = "com.apsotilbible.follow"

local function query_all(collection, did, filter)
  local records = {}
  local request = {
    collection = collection,
    limit = 100,
  }

  if did then
    request.did = did
  end
  if filter then
    request.filter = filter
  end

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
  if not caller_did then
    return { records = toarray({}) }
  end

  local book_id = params.bookId
  local chapter = tonumber(params.chapter)
  if type(book_id) ~= "string" or not string.match(book_id, "^[%w_%-]+$") then
    error("Invalid bookId")
  end
  if not chapter or chapter < 1 or chapter ~= math.floor(chapter) then
    error("Invalid chapter")
  end

  local visible_dids = { [caller_did] = true }
  for _, follow in ipairs(query_all(follow_collection, caller_did)) do
    if type(follow.subject) == "string" then
      visible_dids[follow.subject] = true
    end
  end

  local records = query_all(annotation_collection, nil, {
    field = "verses[0].id",
    op = "LIKE",
    value = book_id .. "/" .. chapter .. ":%",
  })
  local matching_records = {}
  for _, record in ipairs(records) do
    local author_did =
      type(record.uri) == "string" and string.match(record.uri, "^at://([^/]+)/")
    local has_matching_verse = false

    if author_did and visible_dids[author_did] and type(record.verses) == "table" then
      for _, verse in ipairs(record.verses) do
        if type(verse) == "table" and type(verse.id) == "string" then
          local verse_book_id, verse_chapter =
            string.match(verse.id, "^([^/]+)/(%d+):%d+$")
          if verse_book_id == book_id and tonumber(verse_chapter) == chapter then
            has_matching_verse = true
            break
          end
        end
      end
    end

    if has_matching_verse and type(record.comment) == "string" and string.match(record.comment, "%S") then
      table.insert(matching_records, record)
    end
  end

  table.sort(matching_records, function(left, right)
    local left_created_at =
      type(left.createdAt) == "string" and left.createdAt or ""
    local right_created_at =
      type(right.createdAt) == "string" and right.createdAt or ""
    if left_created_at == right_created_at then
      return left.uri < right.uri
    end
    return left_created_at > right_created_at
  end)

  return { records = toarray(matching_records) }
end
