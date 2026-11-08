import hashlib
import unittest
from unittest.mock import patch

from scripts import sync_lootlemon as sync


class DynamicLootlemonMetadataTests(unittest.TestCase):
    def parse(self, html, category="weapons"):
        with patch.object(sync, "get", return_value=html):
            rows, _ = sync.parse_page("https://www.lootlemon.com/db/future-game/weapons", "future-game", category)
        self.assertEqual(len(rows), 1)
        return rows[0]

    def test_unknown_rarity_manufacturer_element_and_type_are_preserved(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell image"><img src="/images/item.png"></div>
          <div class="db_cell large"><a class="link-overlay" href="/item/new-rifle">Nova Rifle</a></div>
          <div class="db_cell rarity-cell"><span class="rarity-mythic">Mythic</span></div>
          <div class="db_cell type-cell" data-label="Equipment Type">Pulse Carbine</div>
          <div class="db_cell manufacturer-cell" data-manufacturer="Hyperion-X">Hyperion-X</div>
          <div class="db_cell element-cell"><span class="element-radiation">Radiation</span></div>
          <div class="db_cell content-cell" data-content="Season 9">Season 9</div>
          <div class="db_cell source-cell"><a href="/boss">The Warden</a></div>
          <div class="db_cell affix-cell"><span data-special-affix="Overcharged">Overcharged</span></div>
        </div>
        """
        item = self.parse(html)
        self.assertEqual(item["rarity"], "Mythic")
        self.assertEqual(item["type"], "Pulse Carbine")
        self.assertEqual(item["manufacturer"], "Hyperion-X")
        self.assertIn("Radiation", item["elements"])
        self.assertEqual(item["content"], "Season 9")
        self.assertEqual(item["sources"], ["The Warden"])
        self.assertEqual(item["attributes"]["special_affix"], ["Overcharged"])
        self.assertIn("Overcharged", item["tags"])
        self.assertEqual(item["category"], "Weapons")

    def test_unknown_equipment_category_is_kept_as_its_own_category(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/quantum-core">Quantum Core</a></div>
          <div class="db_cell rarity-cell" data-rarity="Transcendent">Transcendent</div>
          <div class="db_cell manufacturer-cell">New Foundry</div>
          <div class="db_cell element-cell">Cryo-Plus</div>
        </div>
        """
        item = self.parse(html, category="quantum-cores")
        self.assertEqual(item["category"], "Quantum Cores")
        self.assertEqual(item["rarity"], "Transcendent")
        self.assertEqual(item["manufacturer"], "New Foundry")
        self.assertIn("Cryo-Plus", item["elements"])

    def test_existing_item_identity_formula_is_unchanged(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/stable">Stable Item</a></div>
          <div class="db_cell rarity-cell" data-rarity="Legendary">Legendary</div>
        </div>
        """
        item = self.parse(html)
        identity = "future-game|weapons|https://www.lootlemon.com/item/stable"
        expected = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:20]
        self.assertEqual(item["id"], expected)

    def test_legacy_positional_weapon_fields_still_work(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/legacy">Legacy Rifle</a></div>
          <div class="db_cell">Assault Rifle</div>
          <div class="db_cell">Dahl</div>
          <div class="db_cell">Fire</div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Boss One</a></div>
        </div>
        """
        item = self.parse(html)
        self.assertEqual(item["type"], "Assault Rifle")
        self.assertEqual(item["manufacturer"], "Dahl")
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["Boss One"])

    def test_class_mod_keeps_class_and_skill_labels(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell image"><img src="/images/mod.png"></div>
          <div class="db_cell large"><a class="link-overlay" href="/item/class-mod">Artificer</a></div>
          <div class="db_cell">Amon</div>
          <div class="db_cell"><span><a class="skill-link" href="/skills/bullet-hail"><img alt="Bullet Hail" title="Bullet Hail"></a><a class="skill-link" href="/skills/wildfire"><img alt="Wildfire" title="Wildfire"></a><img alt="Skill Link" title="Skill Link"></span></div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Subjugator</a></div>
        </div>
        """
        item = self.parse(html, category="class-mods")
        self.assertEqual(item["category"], "Class Mods")
        self.assertEqual(item["class"], "Amon")
        self.assertIn("Bullet Hail", item["skills"])
        self.assertIn("Wildfire", item["skills"])
        self.assertNotIn("link", [value.lower() for value in item["skills"]])
        self.assertNotIn("skill link", [value.lower() for value in item["skills"]])
        self.assertNotIn("link", [value.lower() for value in item["attributes"].get("skill", [])])
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["Subjugator"])

    def test_shield_type_is_parsed_positionally(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/shield">Beta Shield</a></div>
          <div class="db_cell">Shield Generator</div>
          <div class="db_cell">Maliwan</div>
          <div class="db_cell"><span class="element-shock">Shock</span></div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Boss B</a></div>
        </div>
        """
        item = self.parse(html, category="shields")
        self.assertEqual(item["type"], "Shield Generator")
        self.assertEqual(item["manufacturer"], "Maliwan")
        self.assertIn("shock", [value.lower() for value in item["elements"]])
        self.assertEqual(item["sources"], ["Boss B"])



    def test_grenade_mods_use_their_own_category_fields(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/test-grenade">Test Grenade</a></div>
          <div class="db_cell">MIRV</div>
          <div class="db_cell">Torgue</div>
          <div class="db_cell"><span class="element-shock">Shock</span></div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Boss One</a></div>
        </div>
        """
        item = self.parse(html, category="grenade-mods")
        self.assertEqual(item["category"], "Grenade Mods")
        self.assertEqual(item["type"], "MIRV")
        self.assertEqual(item["manufacturer"], "Torgue")
        self.assertIn("shock", [value.lower() for value in item["elements"]])
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["Boss One"])

    def test_wonderlands_armor_uses_manufacturer_not_class_or_type(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/test-armor">Test Armor</a></div>
          <div class="db_cell">Swifft</div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Monstrous Shroom</a></div>
        </div>
        """
        item = self.parse(html, category="armor")
        self.assertEqual(item["manufacturer"], "Swifft")
        self.assertIsNone(item["type"])
        self.assertIsNone(item["class"])
        self.assertEqual(item["skills"], [])
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["Monstrous Shroom"])

    def test_oz_kits_have_type_elements_content_and_sources(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/test-oz-kit">Test Oz Kit</a></div>
          <div class="db_cell">Survivability</div>
          <div class="db_cell"><span class="element-fire">Fire</span></div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">CL4P-L3K</a></div>
        </div>
        """
        item = self.parse(html, category="oz-kits")
        self.assertEqual(item["type"], "Survivability")
        self.assertIn("fire", [value.lower() for value in item["elements"]])
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["CL4P-L3K"])

    def test_rings_and_amulets_keep_item_type_separate_from_category(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/test-ring">Test Ring</a></div>
          <div class="db_cell">Ring</div>
          <div class="db_cell">Offense</div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Ring Pool</a></div>
        </div>
        """
        item = self.parse(html, category="rings-amulets")
        self.assertEqual(item["item_type"], "Ring")
        self.assertEqual(item["item_category"], "Offense")
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["Ring Pool"])

    def test_ring_filter_type_and_category_can_be_read_from_card_attributes(self):
        html = """
        <div class="db_item w-dyn-item" data-type="amulet-wl" data-category="Offense">
          <div class="db_cell large"><a class="link-overlay" href="/item/hidden-ring">Hidden Ring</a></div>
          <div class="db_cell">Offense</div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Ring Pool</a></div>
        </div>
        """
        item = self.parse(html, category="rings-amulets")
        self.assertEqual(item["item_type"], "Amulet")
        self.assertEqual(item["item_category"], "Offense")
        self.assertEqual(item["content"], "Base Game")
        self.assertEqual(item["sources"], ["Ring Pool"])

    def test_tree_indexes_are_normalized_per_game_filter_order(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/test-class-mod">Test Mod</a></div>
          <div class="db_cell">Axton</div>
          <div class="db_cell"><span data-tree="0"><img alt="Sentry" title="Sentry"></span></div>
          <div class="db_cell">DAHL</div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Boss One</a></div>
        </div>
        """
        expected = {
            "borderlands-1": "Blue",
            "borderlands-2": "Green",
            "borderlands-tps": "Green",
            "borderlands-3": "Green",
            "borderlands-4": "Green",
        }
        for game, label in expected.items():
            with self.subTest(game=game), patch.object(sync, "get", return_value=html):
                rows, _ = sync.parse_page(
                    f"https://www.lootlemon.com/db/{game}/class-mods",
                    game,
                    "class-mods",
                )
                self.assertIn(label, rows[0]["attributes"]["tree"])

    def test_generic_source_link_icon_is_not_a_skill(self):
        html = """
        <div class="db_item w-dyn-item">
          <div class="db_cell large"><a class="link-overlay" href="/item/test-class-mod">Test Mod</a></div>
          <div class="db_cell">Amon</div>
          <div class="db_cell"><img alt="Real Skill" title="Real Skill"><img alt="Source Link" title="Source Link"></div>
          <div class="db_cell">Base Game</div>
          <div class="db_cell"><a href="/boss">Boss One</a></div>
        </div>
        """
        item = self.parse(html, category="class-mods")
        self.assertIn("Real Skill", item["skills"])
        self.assertNotIn("Source Link", item["skills"])

if __name__ == "__main__":
    unittest.main()
