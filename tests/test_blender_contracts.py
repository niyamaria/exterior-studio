"""Static Blender generator and architectural fixture regression checks.

Blender is a heavy optional runtime: CI verifies Python syntax and the
architectural inputs here; full GLB rendering is a separate manual/integration
check performed on a machine with Blender installed.
"""
import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "blender" / "generate_house_from_plan.py"
EXAMPLES = ROOT / "examples"

class BlenderSourceTests(unittest.TestCase):
    def test_blender_generator_parses_without_blender_installed(self):
        source = SCRIPT.read_text(encoding="utf-8")
        ast.parse(source, filename=str(SCRIPT))

    def test_architecture_fixtures_are_valid_json(self):
        for filename in ("cottage-facade-test.json", "overlapping-front-gables-test.json"):
            with self.subTest(filename=filename):
                plan = json.loads((EXAMPLES / filename).read_text(encoding="utf-8"))
                self.assertGreaterEqual(plan["stories"], 1)
                self.assertTrue(plan["openings"])
                self.assertTrue(plan["siding_color"].startswith("#"))
                self.assertEqual(len(plan["roof_color"]), 7)

    def test_cottage_half_story_and_raised_steps(self):
        plan = json.loads((EXAMPLES / "cottage-facade-test.json").read_text())
        self.assertEqual(plan["upper_level"]["type"], "half_story")
        self.assertEqual(plan["upper_level"]["windows"], 2)
        self.assertTrue(plan["entry_steps"]["present"])
        self.assertTrue(plan["foundation"]["raised"])
        self.assertGreater(plan["foundation"]["height"], 0)

    def test_garage_farmhouse_has_two_front_gables_not_dormer(self):
        plan = json.loads((EXAMPLES / "overlapping-front-gables-test.json").read_text())
        self.assertEqual(len(plan["front_gables"]), 2)
        self.assertEqual(plan["roof_feature"], "front_gable")
        self.assertEqual(plan["upper_level"]["type"], "none")
        self.assertTrue(any(o["kind"] == "garage_door" for o in plan["openings"]))

if __name__ == "__main__":
    unittest.main()
