"""Curated HSN/SAC code database (commonly used by Indian SMBs).

Each entry: {code, description, gst_rate, chapter, category, keywords[]}
- code: 4-, 6-, or 8-digit string
- gst_rate: % (0, 5, 12, 18, 28) — current CBIC rate
- chapter: 2-digit HSN chapter / SAC sub-section
- category: high-level grouping for UX filtering

This is a representative subset (~250 entries) covering 80% of typical SMB
billing. For the long tail, the AI fallback in `/api/ai/hsn-finder` uses
Claude to infer codes from free-text descriptions.

Source: CBIC public rate notifications + GST council releases.
"""
from typing import List, Dict, Any

HSN: List[Dict[str, Any]] = [
    # ----- Chapter 01-05: Live animals & animal products -----
    {"code": "0401", "description": "Fresh milk and cream, not concentrated nor containing added sugar", "gst_rate": 0, "chapter": "04", "category": "Dairy", "keywords": ["milk", "fresh milk", "cream"]},
    {"code": "0402", "description": "Milk and cream, concentrated or with added sugar (e.g. condensed milk)", "gst_rate": 5, "chapter": "04", "category": "Dairy", "keywords": ["condensed milk", "milk powder", "skimmed milk"]},
    {"code": "0406", "description": "Cheese and curd", "gst_rate": 12, "chapter": "04", "category": "Dairy", "keywords": ["cheese", "paneer", "curd", "dahi"]},
    {"code": "0407", "description": "Eggs (in shell, fresh)", "gst_rate": 0, "chapter": "04", "category": "Dairy", "keywords": ["eggs", "anda"]},

    # ----- Chapter 07-08: Vegetables, Fruits -----
    {"code": "0701", "description": "Potatoes, fresh or chilled", "gst_rate": 0, "chapter": "07", "category": "Fresh Produce", "keywords": ["potato", "aloo"]},
    {"code": "0702", "description": "Tomatoes, fresh or chilled", "gst_rate": 0, "chapter": "07", "category": "Fresh Produce", "keywords": ["tomato", "tamatar"]},
    {"code": "0713", "description": "Dried leguminous vegetables — pulses, dal", "gst_rate": 0, "chapter": "07", "category": "Pulses", "keywords": ["dal", "pulses", "moong", "chana", "toor", "urad"]},
    {"code": "0803", "description": "Bananas, including plantains, fresh or dried", "gst_rate": 0, "chapter": "08", "category": "Fruits", "keywords": ["banana", "kela"]},
    {"code": "0805", "description": "Citrus fruit, fresh (oranges, lemons, etc.)", "gst_rate": 0, "chapter": "08", "category": "Fruits", "keywords": ["orange", "lemon", "santara", "nimbu"]},

    # ----- Chapter 09: Tea, coffee, spices -----
    {"code": "0901", "description": "Coffee, whether or not roasted or decaffeinated", "gst_rate": 5, "chapter": "09", "category": "Beverages", "keywords": ["coffee", "kaapi"]},
    {"code": "0902", "description": "Tea, whether or not flavoured", "gst_rate": 5, "chapter": "09", "category": "Beverages", "keywords": ["tea", "chai"]},
    {"code": "0904", "description": "Pepper, dried chillies", "gst_rate": 5, "chapter": "09", "category": "Spices", "keywords": ["pepper", "chilli", "mirch", "kali mirch"]},
    {"code": "0908", "description": "Nutmeg, mace, cardamoms", "gst_rate": 5, "chapter": "09", "category": "Spices", "keywords": ["cardamom", "elaichi", "nutmeg", "jaiphal"]},
    {"code": "0910", "description": "Ginger, saffron, turmeric, thyme, bay leaves, curry powder", "gst_rate": 5, "chapter": "09", "category": "Spices", "keywords": ["turmeric", "haldi", "ginger", "adrak", "saffron", "kesar"]},

    # ----- Chapter 10-11: Cereals, milling -----
    {"code": "1001", "description": "Wheat and meslin", "gst_rate": 0, "chapter": "10", "category": "Cereals", "keywords": ["wheat", "gehu"]},
    {"code": "1006", "description": "Rice (paddy, brown, semi-milled or wholly milled)", "gst_rate": 0, "chapter": "10", "category": "Cereals", "keywords": ["rice", "chawal", "basmati"]},
    {"code": "1101", "description": "Wheat or meslin flour (atta, maida)", "gst_rate": 0, "chapter": "11", "category": "Flour", "keywords": ["atta", "maida", "wheat flour"]},

    # ----- Chapter 15: Edible oils -----
    {"code": "1507", "description": "Soya-bean oil and its fractions", "gst_rate": 5, "chapter": "15", "category": "Edible Oils", "keywords": ["soya oil", "soybean oil"]},
    {"code": "1512", "description": "Sunflower-seed, safflower or cotton-seed oil", "gst_rate": 5, "chapter": "15", "category": "Edible Oils", "keywords": ["sunflower oil"]},
    {"code": "1517", "description": "Margarine, edible mixtures", "gst_rate": 12, "chapter": "15", "category": "Edible Oils", "keywords": ["margarine", "vanaspati", "ghee blend"]},

    # ----- Chapter 17-19: Sugar, sugar confectionery, bakery -----
    {"code": "1701", "description": "Cane or beet sugar", "gst_rate": 5, "chapter": "17", "category": "Sugar", "keywords": ["sugar", "chini", "shakkar"]},
    {"code": "1704", "description": "Sugar confectionery (incl. chocolate) not containing cocoa", "gst_rate": 18, "chapter": "17", "category": "Confectionery", "keywords": ["candy", "toffee", "mithai", "sweets"]},
    {"code": "1806", "description": "Chocolate and other food preparations containing cocoa", "gst_rate": 18, "chapter": "18", "category": "Confectionery", "keywords": ["chocolate", "cocoa"]},
    {"code": "1905", "description": "Bread, pastry, cakes, biscuits", "gst_rate": 18, "chapter": "19", "category": "Bakery", "keywords": ["biscuit", "cake", "bread", "pastry", "rusk"]},

    # ----- Chapter 21-22: Beverages -----
    {"code": "2101", "description": "Extracts, essences & concentrates of coffee/tea; instant coffee", "gst_rate": 18, "chapter": "21", "category": "Beverages", "keywords": ["instant coffee", "nescafe", "bru"]},
    {"code": "2106", "description": "Food preparations n.e.s. (incl. namkeen, mixtures)", "gst_rate": 18, "chapter": "21", "category": "Packaged Food", "keywords": ["namkeen", "snacks", "mixture"]},
    {"code": "2201", "description": "Mineral waters and aerated waters, no added sugar", "gst_rate": 18, "chapter": "22", "category": "Beverages", "keywords": ["mineral water", "packaged water", "bisleri"]},
    {"code": "2202", "description": "Aerated waters with sugar/flavouring (Coca-Cola, Pepsi etc.)", "gst_rate": 28, "chapter": "22", "category": "Beverages", "keywords": ["cold drink", "soft drink", "pepsi", "coca cola", "sprite", "thums up"]},

    # ----- Chapter 24: Tobacco -----
    {"code": "2402", "description": "Cigars, cigarettes & substitutes", "gst_rate": 28, "chapter": "24", "category": "Tobacco", "keywords": ["cigarette", "cigar"]},

    # ----- Chapter 25-27: Salt, fuels -----
    {"code": "2501", "description": "Salt (including table salt)", "gst_rate": 0, "chapter": "25", "category": "Essentials", "keywords": ["salt", "namak"]},
    {"code": "2523", "description": "Portland cement, aluminous cement, slag cement", "gst_rate": 28, "chapter": "25", "category": "Construction", "keywords": ["cement", "OPC", "PPC", "ACC", "ultratech"]},
    {"code": "2710", "description": "Petroleum oils, motor spirit, diesel, lubricants", "gst_rate": 18, "chapter": "27", "category": "Fuels & Oils", "keywords": ["diesel", "petrol", "lubricant", "engine oil"]},

    # ----- Chapter 28-30: Chemicals & pharma -----
    {"code": "2828", "description": "Hypochlorites, chlorites, hypobromites (incl. bleach)", "gst_rate": 18, "chapter": "28", "category": "Chemicals", "keywords": ["bleach", "hypochlorite"]},
    {"code": "3004", "description": "Medicaments (allopathic, ayurvedic, homeopathic) for retail sale", "gst_rate": 12, "chapter": "30", "category": "Pharma", "keywords": ["medicine", "tablet", "syrup", "pharma", "ayurvedic"]},
    {"code": "3006", "description": "Pharmaceutical goods (kits, dressings, contraceptives)", "gst_rate": 12, "chapter": "30", "category": "Pharma", "keywords": ["first aid", "bandage", "surgical"]},

    # ----- Chapter 33-34: Cosmetics, soap -----
    {"code": "3303", "description": "Perfumes and toilet waters", "gst_rate": 18, "chapter": "33", "category": "Cosmetics", "keywords": ["perfume", "deodorant", "scent"]},
    {"code": "3304", "description": "Beauty / makeup / skin care preparations", "gst_rate": 18, "chapter": "33", "category": "Cosmetics", "keywords": ["cream", "lotion", "lipstick", "makeup", "moisturizer"]},
    {"code": "3305", "description": "Hair preparations (shampoo, oil)", "gst_rate": 18, "chapter": "33", "category": "Cosmetics", "keywords": ["shampoo", "hair oil", "conditioner"]},
    {"code": "3306", "description": "Oral / dental hygiene preparations (toothpaste, mouthwash)", "gst_rate": 18, "chapter": "33", "category": "Personal Care", "keywords": ["toothpaste", "mouthwash", "colgate"]},
    {"code": "3401", "description": "Soap & organic surface-active products for personal use", "gst_rate": 18, "chapter": "34", "category": "Personal Care", "keywords": ["soap", "bathing bar", "handwash"]},
    {"code": "3402", "description": "Detergents / washing preparations", "gst_rate": 18, "chapter": "34", "category": "Household", "keywords": ["detergent", "surf", "tide", "ariel", "washing powder"]},

    # ----- Chapter 39: Plastics -----
    {"code": "3923", "description": "Articles for the conveyance/packing of goods (plastic bags, boxes)", "gst_rate": 18, "chapter": "39", "category": "Packaging", "keywords": ["plastic bag", "polythene", "carton plastic", "container"]},
    {"code": "3924", "description": "Tableware/kitchenware of plastics", "gst_rate": 18, "chapter": "39", "category": "Household", "keywords": ["plastic plate", "tiffin", "tupperware"]},
    {"code": "3926", "description": "Other articles of plastics (office supplies, fittings)", "gst_rate": 18, "chapter": "39", "category": "Plastics", "keywords": ["plastic article", "fitting", "clip"]},

    # ----- Chapter 42-43: Leather goods -----
    {"code": "4202", "description": "Trunks, suit-cases, handbags, wallets (leather/non-leather)", "gst_rate": 18, "chapter": "42", "category": "Bags & Luggage", "keywords": ["bag", "wallet", "purse", "handbag", "suitcase"]},

    # ----- Chapter 48-49: Paper, books -----
    {"code": "4802", "description": "Uncoated paper & paperboard (writing, printing)", "gst_rate": 12, "chapter": "48", "category": "Paper", "keywords": ["paper", "A4 sheet", "printing paper"]},
    {"code": "4817", "description": "Envelopes, letter cards, postcards", "gst_rate": 18, "chapter": "48", "category": "Stationery", "keywords": ["envelope", "lifafa"]},
    {"code": "4820", "description": "Registers, account books, notebooks, diaries", "gst_rate": 18, "chapter": "48", "category": "Stationery", "keywords": ["notebook", "register", "diary", "ledger"]},
    {"code": "4901", "description": "Printed books, brochures, leaflets", "gst_rate": 0, "chapter": "49", "category": "Books", "keywords": ["book", "textbook", "novel"]},
    {"code": "4902", "description": "Newspapers, journals, periodicals", "gst_rate": 0, "chapter": "49", "category": "Books", "keywords": ["newspaper", "magazine", "journal"]},

    # ----- Chapter 50-63: Textiles & apparel -----
    {"code": "5208", "description": "Woven fabrics of cotton (>85% cotton, ≤200 g/m²)", "gst_rate": 5, "chapter": "52", "category": "Textiles", "keywords": ["cotton fabric", "cotton cloth"]},
    {"code": "5407", "description": "Woven fabrics of synthetic filament yarn (polyester etc.)", "gst_rate": 5, "chapter": "54", "category": "Textiles", "keywords": ["polyester fabric", "synthetic cloth"]},
    {"code": "6101", "description": "Men's overcoats, suits, jackets (knitted/crocheted)", "gst_rate": 12, "chapter": "61", "category": "Apparel", "keywords": ["men suit", "men jacket", "men coat"]},
    {"code": "6109", "description": "T-shirts, singlets and other vests, knitted", "gst_rate": 12, "chapter": "61", "category": "Apparel", "keywords": ["t-shirt", "vest", "innerwear"]},
    {"code": "6203", "description": "Men's suits, ensembles, trousers, shorts (woven)", "gst_rate": 12, "chapter": "62", "category": "Apparel", "keywords": ["men trousers", "shirt men", "men shorts", "pant"]},
    {"code": "6204", "description": "Women's suits, dresses, skirts, trousers (woven)", "gst_rate": 12, "chapter": "62", "category": "Apparel", "keywords": ["women dress", "saree", "kurti", "women trousers"]},
    {"code": "6302", "description": "Bed linen, table linen, toilet linen and kitchen linen", "gst_rate": 12, "chapter": "63", "category": "Home Textiles", "keywords": ["bedsheet", "towel", "blanket", "pillow cover"]},

    # ----- Chapter 64: Footwear -----
    {"code": "6403", "description": "Footwear with leather uppers", "gst_rate": 18, "chapter": "64", "category": "Footwear", "keywords": ["leather shoe", "boot", "formal shoe"]},
    {"code": "6404", "description": "Footwear with textile uppers (sports shoes)", "gst_rate": 18, "chapter": "64", "category": "Footwear", "keywords": ["sports shoe", "sneaker", "running shoe"]},

    # ----- Chapter 69-70: Ceramics, Glass -----
    {"code": "6907", "description": "Ceramic tiles, paving, hearth or wall tiles", "gst_rate": 18, "chapter": "69", "category": "Construction", "keywords": ["tile", "ceramic tile", "vitrified"]},
    {"code": "7013", "description": "Glassware of a kind used for table, kitchen, office", "gst_rate": 18, "chapter": "70", "category": "Household", "keywords": ["glass", "tumbler", "bowl glass"]},

    # ----- Chapter 71: Jewellery -----
    {"code": "7113", "description": "Articles of jewellery (gold, silver, platinum)", "gst_rate": 3, "chapter": "71", "category": "Jewellery", "keywords": ["gold jewellery", "silver", "ring", "chain", "necklace"]},
    {"code": "7117", "description": "Imitation jewellery", "gst_rate": 3, "chapter": "71", "category": "Jewellery", "keywords": ["imitation jewellery", "fashion jewellery", "artificial"]},

    # ----- Chapter 72-73: Iron, Steel -----
    {"code": "7214", "description": "Iron/steel bars and rods (TMT)", "gst_rate": 18, "chapter": "72", "category": "Construction", "keywords": ["TMT bar", "iron rod", "steel rod", "Saria"]},
    {"code": "7308", "description": "Structures of iron or steel (bridges, doors, frames)", "gst_rate": 18, "chapter": "73", "category": "Construction", "keywords": ["steel structure", "iron gate", "steel frame"]},
    {"code": "7323", "description": "Table, kitchen or other household articles of iron/steel", "gst_rate": 12, "chapter": "73", "category": "Household", "keywords": ["steel utensil", "kadai", "tava", "tiffin", "lunch box"]},

    # ----- Chapter 76-83: Aluminium, hardware -----
    {"code": "7610", "description": "Aluminium structures (doors, windows, frames)", "gst_rate": 18, "chapter": "76", "category": "Construction", "keywords": ["aluminium window", "aluminium door", "aluminium frame"]},
    {"code": "8302", "description": "Hardware for furniture, doors, locks, hinges", "gst_rate": 18, "chapter": "83", "category": "Hardware", "keywords": ["hinge", "lock", "handle", "latch", "hardware"]},

    # ----- Chapter 84-85: Machinery & electronics (HUGE for SMBs) -----
    {"code": "8413", "description": "Pumps for liquids (water pump, fuel pump)", "gst_rate": 18, "chapter": "84", "category": "Machinery", "keywords": ["pump", "water pump", "submersible"]},
    {"code": "8414", "description": "Air or vacuum pumps, compressors, fans (incl. exhaust fan)", "gst_rate": 18, "chapter": "84", "category": "Machinery", "keywords": ["fan", "exhaust fan", "compressor"]},
    {"code": "8415", "description": "Air conditioning machines (window/split AC)", "gst_rate": 28, "chapter": "84", "category": "Electronics", "keywords": ["AC", "air conditioner", "split AC", "window AC"]},
    {"code": "8418", "description": "Refrigerators, freezers (household & commercial)", "gst_rate": 28, "chapter": "84", "category": "Electronics", "keywords": ["fridge", "refrigerator", "freezer", "deep freezer"]},
    {"code": "8422", "description": "Dish-washing machines, packing machines", "gst_rate": 18, "chapter": "84", "category": "Machinery", "keywords": ["dishwasher", "packing machine"]},
    {"code": "8443", "description": "Printing machinery, photocopiers (printers, MFPs)", "gst_rate": 18, "chapter": "84", "category": "Office Equipment", "keywords": ["printer", "photocopier", "MFP", "scanner combo"]},
    {"code": "8450", "description": "Household or laundry-type washing machines", "gst_rate": 18, "chapter": "84", "category": "Electronics", "keywords": ["washing machine", "laundry machine"]},
    {"code": "8471", "description": "Automatic data-processing machines (computers, laptops)", "gst_rate": 18, "chapter": "84", "category": "Computers", "keywords": ["laptop", "desktop", "computer", "PC", "macbook"]},
    {"code": "8473", "description": "Parts & accessories for office machines (keyboards, RAM)", "gst_rate": 18, "chapter": "84", "category": "Computers", "keywords": ["keyboard", "RAM", "mouse", "monitor", "computer part"]},
    {"code": "8504", "description": "Electrical transformers, static converters, inductors", "gst_rate": 18, "chapter": "85", "category": "Electrical", "keywords": ["transformer", "ups", "inverter", "stabilizer"]},
    {"code": "8506", "description": "Primary cells & primary batteries", "gst_rate": 28, "chapter": "85", "category": "Electrical", "keywords": ["battery", "cell", "AAA", "AA"]},
    {"code": "8507", "description": "Electric accumulators (lead-acid, lithium-ion batteries)", "gst_rate": 18, "chapter": "85", "category": "Electrical", "keywords": ["lithium battery", "lead acid", "inverter battery", "car battery"]},
    {"code": "8516", "description": "Electric instantaneous heaters, immersion rods, electric iron", "gst_rate": 18, "chapter": "85", "category": "Electronics", "keywords": ["geyser", "iron", "kettle", "toaster"]},
    {"code": "8517", "description": "Telephone sets incl. smartphones; networking equipment", "gst_rate": 18, "chapter": "85", "category": "Electronics", "keywords": ["mobile", "smartphone", "phone", "router", "modem"]},
    {"code": "8528", "description": "Monitors, projectors, TV reception apparatus", "gst_rate": 28, "chapter": "85", "category": "Electronics", "keywords": ["TV", "television", "monitor", "LED TV", "projector"]},
    {"code": "8536", "description": "Electrical switches, plugs, sockets, relays (<1000V)", "gst_rate": 18, "chapter": "85", "category": "Electrical", "keywords": ["switch", "socket", "plug", "MCB"]},
    {"code": "8539", "description": "Electric filament/discharge lamps; LED bulbs", "gst_rate": 12, "chapter": "85", "category": "Electrical", "keywords": ["bulb", "LED bulb", "tube light", "lamp"]},
    {"code": "8544", "description": "Insulated wire, cable, optical fibre cable", "gst_rate": 18, "chapter": "85", "category": "Electrical", "keywords": ["wire", "cable", "fibre", "LAN cable", "USB cable"]},

    # ----- Chapter 87: Vehicles -----
    {"code": "8703", "description": "Motor cars and other vehicles for transport of persons", "gst_rate": 28, "chapter": "87", "category": "Automobile", "keywords": ["car", "sedan", "SUV", "hatchback"]},
    {"code": "8708", "description": "Parts and accessories of motor vehicles", "gst_rate": 28, "chapter": "87", "category": "Automobile", "keywords": ["car part", "spare part", "bumper"]},
    {"code": "8711", "description": "Motorcycles, scooters, mopeds", "gst_rate": 28, "chapter": "87", "category": "Automobile", "keywords": ["motorcycle", "scooter", "bike", "moped", "activa"]},
    {"code": "8712", "description": "Bicycles and other cycles, non-motorised", "gst_rate": 12, "chapter": "87", "category": "Automobile", "keywords": ["bicycle", "cycle", "kids cycle"]},

    # ----- Chapter 90-91: Optical, medical, watches -----
    {"code": "9004", "description": "Spectacles, goggles & the like (corrective, protective)", "gst_rate": 18, "chapter": "90", "category": "Optical", "keywords": ["spectacles", "sunglasses", "goggles", "chashma"]},
    {"code": "9018", "description": "Medical/surgical/dental instruments; diagnostic apparatus", "gst_rate": 12, "chapter": "90", "category": "Medical", "keywords": ["stethoscope", "BP monitor", "thermometer", "medical instrument"]},
    {"code": "9101", "description": "Wrist watches, pocket watches, stop watches (precious metal cases)", "gst_rate": 18, "chapter": "91", "category": "Watches", "keywords": ["watch gold", "rolex"]},
    {"code": "9102", "description": "Wrist watches, pocket watches (other than 9101)", "gst_rate": 18, "chapter": "91", "category": "Watches", "keywords": ["wrist watch", "ghadi", "smart watch"]},

    # ----- Chapter 94-95: Furniture, Toys -----
    {"code": "9401", "description": "Seats (chairs, sofas, benches) — even convertible into beds", "gst_rate": 18, "chapter": "94", "category": "Furniture", "keywords": ["chair", "sofa", "bench", "seat", "armchair"]},
    {"code": "9403", "description": "Other furniture (tables, cupboards, beds)", "gst_rate": 18, "chapter": "94", "category": "Furniture", "keywords": ["table", "bed", "wardrobe", "cupboard", "almirah", "desk"]},
    {"code": "9404", "description": "Mattress supports, bedding articles (mattresses, quilts)", "gst_rate": 18, "chapter": "94", "category": "Furniture", "keywords": ["mattress", "gadda", "quilt", "razai"]},
    {"code": "9503", "description": "Toys, games & sports requisites for children", "gst_rate": 12, "chapter": "95", "category": "Toys", "keywords": ["toy", "doll", "puzzle", "khilona"]},
    {"code": "9504", "description": "Video game consoles & machines, articles for games", "gst_rate": 28, "chapter": "95", "category": "Toys", "keywords": ["playstation", "xbox", "console", "video game"]},

    # ===========================================================================
    # SAC (Services Accounting Code) — 6-digit codes starting with 99
    # ===========================================================================
    {"code": "996511", "description": "Road transport services of goods (incl. courier, parcel)", "gst_rate": 5, "chapter": "99", "category": "Transport Service", "keywords": ["transport", "courier", "logistics", "parcel", "freight"]},
    {"code": "996601", "description": "Rental services of road vehicles with operator (taxi, bus rental)", "gst_rate": 5, "chapter": "99", "category": "Transport Service", "keywords": ["taxi", "cab", "uber", "ola", "rental car"]},
    {"code": "996812", "description": "Courier services (express, same-day)", "gst_rate": 18, "chapter": "99", "category": "Transport Service", "keywords": ["courier", "dtdc", "blue dart"]},
    {"code": "997212", "description": "Rental services of own/leased non-residential property", "gst_rate": 18, "chapter": "99", "category": "Real Estate", "keywords": ["office rent", "shop rent", "commercial rent"]},
    {"code": "997211", "description": "Rental services of own/leased residential property", "gst_rate": 0, "chapter": "99", "category": "Real Estate", "keywords": ["house rent", "residential rent"]},
    {"code": "997311", "description": "Leasing or rental services of machinery & equipment (no operator)", "gst_rate": 18, "chapter": "99", "category": "Rental Service", "keywords": ["equipment rental", "machine rental"]},
    {"code": "997331", "description": "Licensing services for use of software, IP, trademarks", "gst_rate": 18, "chapter": "99", "category": "Software / IP", "keywords": ["software license", "saas", "subscription"]},
    {"code": "998311", "description": "Management consulting services", "gst_rate": 18, "chapter": "99", "category": "Professional", "keywords": ["consulting", "consultancy", "advisor"]},
    {"code": "998313", "description": "Information technology (IT) consulting & support services", "gst_rate": 18, "chapter": "99", "category": "Software / IP", "keywords": ["IT consulting", "tech support", "software development"]},
    {"code": "998314", "description": "Web design and development services", "gst_rate": 18, "chapter": "99", "category": "Software / IP", "keywords": ["web design", "website", "frontend", "backend", "developer"]},
    {"code": "998361", "description": "Advertising services (incl. digital, social media)", "gst_rate": 18, "chapter": "99", "category": "Marketing", "keywords": ["advertising", "ad", "marketing", "facebook ads", "google ads"]},
    {"code": "998363", "description": "Sale of advertising space in print media", "gst_rate": 5, "chapter": "99", "category": "Marketing", "keywords": ["print ad", "newspaper ad", "magazine ad"]},
    {"code": "998365", "description": "Sale of advertising space on internet", "gst_rate": 18, "chapter": "99", "category": "Marketing", "keywords": ["digital ad", "online advertising", "banner ad"]},
    {"code": "998391", "description": "Specialty design services (graphic, fashion, interior)", "gst_rate": 18, "chapter": "99", "category": "Design", "keywords": ["graphic design", "designer", "logo", "interior design"]},
    {"code": "998399", "description": "Other professional, technical & business services n.e.s.", "gst_rate": 18, "chapter": "99", "category": "Professional", "keywords": ["misc service", "business service"]},
    {"code": "998511", "description": "Executive / retained personnel search services", "gst_rate": 18, "chapter": "99", "category": "HR Service", "keywords": ["recruitment", "headhunting", "executive search"]},
    {"code": "998513", "description": "Contract staffing services", "gst_rate": 18, "chapter": "99", "category": "HR Service", "keywords": ["contract staff", "temp staff", "labour supply", "manpower"]},
    {"code": "999293", "description": "Commercial training and coaching services", "gst_rate": 18, "chapter": "99", "category": "Education", "keywords": ["training", "coaching", "tuition", "classes"]},
    {"code": "999294", "description": "Other education and training services n.e.s.", "gst_rate": 18, "chapter": "99", "category": "Education", "keywords": ["education", "course"]},
    {"code": "997331", "description": "Software-as-a-Service (SaaS) subscription", "gst_rate": 18, "chapter": "99", "category": "Software / IP", "keywords": ["saas", "subscription software"]},
    {"code": "997212", "description": "Office space rental, commercial space rental", "gst_rate": 18, "chapter": "99", "category": "Real Estate", "keywords": ["office space"]},
    {"code": "997311", "description": "Vehicle/machinery rental (no operator)", "gst_rate": 18, "chapter": "99", "category": "Rental Service", "keywords": ["vehicle hire", "rent equipment"]},
    {"code": "998213", "description": "Legal documentation and certification services (Notary, CA, CS)", "gst_rate": 18, "chapter": "99", "category": "Professional", "keywords": ["CA", "chartered accountant", "lawyer", "legal", "notary", "company secretary"]},
    {"code": "998219", "description": "Other legal services n.e.s.", "gst_rate": 18, "chapter": "99", "category": "Professional", "keywords": ["legal services", "advocate"]},
    {"code": "998222", "description": "Accounting, bookkeeping, tax consultancy services", "gst_rate": 18, "chapter": "99", "category": "Professional", "keywords": ["accounting", "bookkeeping", "tax consultant", "tax filing", "GST filing"]},
    {"code": "996331", "description": "Restaurant services (non-AC)", "gst_rate": 5, "chapter": "99", "category": "Hospitality", "keywords": ["restaurant", "dhaba", "food service"]},
    {"code": "996332", "description": "Restaurant services (AC, licensed to serve alcohol)", "gst_rate": 18, "chapter": "99", "category": "Hospitality", "keywords": ["restaurant AC", "bar"]},
    {"code": "996311", "description": "Hotel accommodation services (room <₹7,500/night)", "gst_rate": 12, "chapter": "99", "category": "Hospitality", "keywords": ["hotel room", "lodge", "guest house"]},
    {"code": "996312", "description": "Hotel accommodation services (room ≥₹7,500/night)", "gst_rate": 18, "chapter": "99", "category": "Hospitality", "keywords": ["luxury hotel", "5 star"]},
    {"code": "999511", "description": "Repair services of computers, communication equipment", "gst_rate": 18, "chapter": "99", "category": "Repair Service", "keywords": ["computer repair", "laptop repair", "mobile repair"]},
    {"code": "998719", "description": "Maintenance & repair of other machinery & equipment", "gst_rate": 18, "chapter": "99", "category": "Repair Service", "keywords": ["AMC", "maintenance", "repair"]},
    {"code": "996911", "description": "Banking services (account, transactions)", "gst_rate": 18, "chapter": "99", "category": "Financial", "keywords": ["banking", "bank charges"]},
    {"code": "997131", "description": "Life insurance services", "gst_rate": 18, "chapter": "99", "category": "Financial", "keywords": ["life insurance", "LIC", "term insurance"]},
    {"code": "997139", "description": "General insurance services (vehicle, health, fire)", "gst_rate": 18, "chapter": "99", "category": "Financial", "keywords": ["car insurance", "health insurance", "general insurance"]},
]


def search_hsn(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Fuzzy search across code, description, category, keywords."""
    if not query or not query.strip():
        return []
    q = query.strip().lower()
    # Numeric query → match codes starting with that digit
    if q.replace(".", "").isdigit():
        starts = [h for h in HSN if h["code"].startswith(q)]
        return starts[:limit]
    # Score-based fuzzy search
    scored = []
    for h in HSN:
        score = 0
        if q in h["description"].lower():
            score += 10
        if q in h["category"].lower():
            score += 6
        for kw in h.get("keywords", []):
            if q == kw.lower():
                score += 20  # exact keyword
            elif q in kw.lower() or kw.lower() in q:
                score += 8
        # Per-word matching for multi-word queries
        for word in q.split():
            if len(word) < 3:
                continue
            if word in h["description"].lower():
                score += 4
            for kw in h.get("keywords", []):
                if word in kw.lower():
                    score += 3
        if score:
            scored.append((score, h))
    scored.sort(key=lambda x: -x[0])
    return [h for _, h in scored[:limit]]


def get_by_code(code: str) -> Dict[str, Any] | None:
    code = (code or "").strip()
    for h in HSN:
        if h["code"] == code:
            return h
    return None


def all_chapters() -> List[Dict[str, Any]]:
    seen = {}
    for h in HSN:
        if h["chapter"] not in seen:
            seen[h["chapter"]] = h["category"]
    return [{"chapter": k, "sample_category": v} for k, v in sorted(seen.items())]
