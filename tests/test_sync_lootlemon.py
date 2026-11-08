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


if __name__ == "__main__":
    unittest.main()
