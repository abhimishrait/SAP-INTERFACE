# Smoke-test every SAP master endpoint. Run with backend up on http://localhost:4000.
$ErrorActionPreference = 'Continue'
$pair = "SujalFoods:SujalFoods@123"
$b64  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$hdrs = @{Authorization = "Basic $b64"; 'Content-Type' = 'application/json'}
$base = "http://localhost:4000/sap"
$stamp = Get-Date -Format "HHmmss"

$results = @()

function Hit($name, $method, $url, $body) {
  try {
    $r = Invoke-WebRequest -Method $method -Uri $url -Headers $hdrs -Body $body -UseBasicParsing -ErrorAction Stop
    $script:results += [pscustomobject]@{ Test=$name; Status=$r.StatusCode; Resp=$r.Content.Substring(0,[Math]::Min(120,$r.Content.Length)) }
    return ($r.Content | ConvertFrom-Json)
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $msg  = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    $script:results += [pscustomobject]@{ Test=$name; Status=$code; Resp=$msg.Substring(0,[Math]::Min(160,$msg.Length)) }
    return $null
  }
}

# 3.3 Greater Circles (zones)
$gc = Hit "3.3 greater-circles POST" "POST" "$base/greater-circles/" "{`"name`":`"ZoneSmoke$stamp`",`"status`":`"Y`"}"
if ($gc) { Hit "3.3 greater-circles PUT" "PUT" "$base/greater-circles/$($gc.id)/" "{`"name`":`"ZoneSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.4 Circles (towns, FK zone)
$zoneName = if ($gc) { "ZoneSmoke${stamp}_u" } else { "Kathmandu" }
$cir = Hit "3.4 circles POST" "POST" "$base/circles/" "{`"name`":`"TownSmoke$stamp`",`"greater_circle_name`":`"$zoneName`",`"status`":`"Y`"}"
if ($cir) { Hit "3.4 circles PUT" "PUT" "$base/circles/$($cir.id)/" "{`"name`":`"TownSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.5 Container (packaging_types)
$cn = Hit "3.5 container POST" "POST" "$base/container/" "{`"name`":`"CrateSmoke$stamp`",`"level`":`"PRIMARY`",`"status`":`"Y`"}"
if ($cn) { Hit "3.5 container PUT" "PUT" "$base/container/$($cn.id)/" "{`"name`":`"CrateSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.5b second container at SECONDARY level (needed for products test)
$cn2 = Hit "3.5 container POST (secondary)" "POST" "$base/container/" "{`"name`":`"PouchSmoke$stamp`",`"level`":`"SECONDARY`",`"status`":`"Y`"}"

# 3.6 Matrix (sujal_matrices)
$mx = Hit "3.6 matrix POST" "POST" "$base/matrix/" "{`"material_group`":`"MGSmoke$stamp`",`"product_class_name`":`"PCSmoke$stamp`",`"hsn_code`":`"HSN$stamp`",`"order_of`":1,`"unit`":`"PCS`",`"status`":`"Y`"}"
if ($mx) { Hit "3.6 matrix PUT" "PUT" "$base/matrix/$($mx.id)/" "{`"order_of`":2,`"status`":`"Y`"}" | Out-Null }

# 3.7 Product Class (production_categories)
$pc = Hit "3.7 product-class POST" "POST" "$base/product-class/" "{`"name`":`"PCatSmoke$stamp`",`"unit`":`"kg`",`"status`":`"Y`"}"
if ($pc) { Hit "3.7 product-class PUT" "PUT" "$base/product-class/$($pc.id)/" "{`"name`":`"PCatSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.8 Product Name (master_lookups)
$pcName = if ($pc) { "PCatSmoke${stamp}_u" } else { "Default" }
$pn = Hit "3.8 product-name POST" "POST" "$base/product-name/" "{`"name`":`"PNSmoke$stamp`",`"product_class_name`":`"$pcName`",`"status`":`"Y`"}"
if ($pn) { Hit "3.8 product-name PUT" "PUT" "$base/product-name/$($pn.id)/" "{`"name`":`"PNSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.9 Payment Terms
$pt = Hit "3.9 payment-terms POST" "POST" "$base/payment-terms/" "{`"payment_term_name`":`"PTSmoke$stamp`",`"term_days`":30,`"status`":`"Y`"}"
if ($pt) { Hit "3.9 payment-terms PUT" "PUT" "$base/payment-terms/$($pt.id)/" "{`"payment_term_name`":`"PTSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.10 Price List Group (price_groups)
$pg = Hit "3.10 price-list-group POST" "POST" "$base/price-list-group/" "{`"name`":`"PGSmoke$stamp`",`"status`":`"Y`"}"
if ($pg) { Hit "3.10 price-list-group PUT" "PUT" "$base/price-list-group/$($pg.id)/" "{`"name`":`"PGSmoke${stamp}_u`",`"status`":`"Y`"}" | Out-Null }

# 3.1 BP Master
$bpCode = "BPS$stamp"
$bpBody = @{customer_code=$bpCode;store_name="BP Smoke";first_name="A";last_name="B";contact_country_code="+977";contact_number="9777$stamp";bill_to_address_line_1="L1";bill_to_country_name="Nepal";ship_to_address_line_1="L1";ship_to_country_name="Nepal";vat_number="V$stamp";pan_number="P$stamp";date_of_joining="2026-06-03";status="Y";cost_center_master="CC.A"} | ConvertTo-Json -Compress
$bp = Hit "3.1 bp-master POST" "POST" "$base/bp-master/" $bpBody
if ($bp) { Hit "3.1 bp-master PUT" "PUT" "$base/bp-master/$($bp.id)/" "{`"store_name`":`"BP Smoke Updated`",`"status`":`"Y`"}" | Out-Null }

# 3.13 Products (needs lots of lookups)
$prodBody = @{
  product_name = if ($pn) { "PNSmoke${stamp}_u" } else { "Default" }
  hsn_code = "HSN$stamp"
  variant_code = "SKU$stamp"
  sujal_matrix = "MGSmoke$stamp"
  primary_selling_unit_name = if ($cn) { "CrateSmoke${stamp}_u" } else { "Crate" }
  secondary_selling_unit_name = if ($cn2) { "PouchSmoke$stamp" } else { "Pouch" }
  mrp = 100
  is_packaging_allow = "Y"
  status = "Y"
  tax_code = @(@{country_name="Nepal"; tax_name="VAT 13%"; tax_percentage=13})
} | ConvertTo-Json -Compress -Depth 5
$pr = Hit "3.13 products POST" "POST" "$base/products/" $prodBody

# 3.11 Price List (needs price-group + product)
if ($pg -and $pr) {
  $plBody = @{rate_group="PGSmoke${stamp}_u"; item_code="SKU$stamp"; container_price=99.99; status="Y"} | ConvertTo-Json -Compress
  Hit "3.11 price-list POST" "POST" "$base/price-list/" $plBody | Out-Null
}

# 3.12 Special Price List (needs party + product)
if ($bp -and $pr) {
  $splBody = @{item_code="SKU$stamp"; container_price=99.99; discount=10; party_code=$bpCode; start_date="2026-06-01"; end_date="2026-12-31"; status="Y"} | ConvertTo-Json -Compress
  Hit "3.12 special-price-list POST" "POST" "$base/special-price-list/" $splBody | Out-Null
}

# 3.2 Blanket Agreement (qty/general)
if ($bp -and $pr) {
  $baBody = @{
    bp_code = $bpCode; bp_name = "BP Smoke"
    agreement_method = "qty"; agreement_type = "general"
    scheme_name = "Smoke Agreement"
    start_date = "2026-06-01"; end_date = "2026-12-31"; status = "Y"
    lines = @(@{line_number=1; item_code="SKU$stamp"; item_name="SKU$stamp"; planned_quantity=100; portion_of_returns=5})
  } | ConvertTo-Json -Compress -Depth 5
  Hit "3.2 blanket-agreement POST" "POST" "$base/blanket-agreement/" $baBody | Out-Null
}

# 3.15 Balance Status Update (currently 501)
Hit "3.15 balance-status-update PUT" "PUT" "$base/balance-status-update/" "{`"party_code`":`"$bpCode`",`"updated_amount`":1500}" | Out-Null

# Report
Write-Output ""
Write-Output "=== SMOKE RESULTS ==="
$results | Format-Table -AutoSize Test,Status -Wrap
Write-Output ""
Write-Output "=== FAILURES (status != 2xx) ==="
$failures = $results | Where-Object { $_.Status -lt 200 -or $_.Status -ge 300 }
if ($failures) { $failures | Format-List Test,Status,Resp } else { Write-Output "None." }
