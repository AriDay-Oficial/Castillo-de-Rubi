import assert from "node:assert/strict";
import { test } from "node:test";

import { BOSSES } from "../src/content/bosses.js";
import { ENEMY_TIERS } from "../src/content/enemies.js";
import { LOOT_TABLES } from "../src/content/items.js";
import { SPRITE_IDS, enemyLook, enemySprite, heroSprite, itemSprite, spriteData, spriteSvg } from "../src/ui/sprites.js";

const ENEMIES = Object.values(ENEMY_TIERS).flat();
const ITEMS = Object.values(LOOT_TABLES).flat();
const FAMILIES = ["bestia", "humanoide", "no-muerto", "mago", "elemental", "gigante", "elite"];

test("todas las rejillas son cuadradas y solo usan colores de su paleta", () => {
  assert.ok(SPRITE_IDS.length >= 19);
  for (const id of SPRITE_IDS) {
    const { rows, palette } = spriteData(id);
    assert.ok(rows.length === 16 || rows.length === 12, `${id}: ${rows.length} filas`);
    for (const row of rows) {
      assert.equal(row.length, rows.length, `${id}: fila de ancho ${row.length}`);
      for (const char of row) {
        assert.ok(char === "." || palette[char], `${id}: color desconocido «${char}»`);
      }
    }
    assert.ok(rows.join("").replaceAll(".", "").length >= 20, `${id}: casi vacío`);
  }
});

test("cada familia de enemigos tiene su silueta", () => {
  for (const family of FAMILIES) {
    assert.ok(SPRITE_IDS.includes(family), family);
    assert.equal(enemyLook({ id: "desconocido", tags: [family] }).shape, family);
  }
  assert.equal(enemyLook({ id: "desconocido" }).shape, "bestia");
});

test("todos los enemigos tienen sprite, de la familia que les corresponde", () => {
  assert.ok(ENEMIES.length >= 16);
  for (const enemy of ENEMIES) {
    const look = enemyLook(enemy);
    assert.ok(SPRITE_IDS.includes(look.shape), enemy.id);
    assert.ok(enemy.tags.includes(look.shape), `${enemy.id} usa la silueta «${look.shape}»`);
    assert.match(enemySprite(enemy), /^<svg class="sprite"/);
  }
});

test("enemigos de la misma familia se distinguen por el color", () => {
  const byShape = new Map();
  for (const enemy of ENEMIES) {
    const { shape } = enemyLook(enemy);
    byShape.set(shape, [...(byShape.get(shape) || []), enemySprite(enemy)]);
  }
  for (const [shape, sprites] of byShape) {
    assert.equal(new Set(sprites).size, sprites.length, `${shape}: sprites repetidos`);
  }
});

test("cada jefe y cada objeto tiene un sprite propio", () => {
  for (const boss of BOSSES) {
    assert.equal(enemyLook(boss).shape, boss.id);
    assert.notEqual(spriteSvg(boss.id), "");
  }
  assert.ok(ITEMS.length >= 7);
  for (const item of ITEMS) {
    assert.match(itemSprite(item.id), /width="24" height="24" viewBox="0 0 12 12"/, item.id);
  }
  assert.match(heroSprite({ size: 48 }), /width="48"/);
});

test("el SVG es decorativo, nítido y admite clase y paleta", () => {
  const svg = spriteSvg("bestia", { size: 32, className: "sprite--ghost", palette: { a: "#123456" } });
  assert.match(svg, /class="sprite sprite--ghost"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /#123456/);
  assert.equal(spriteSvg("no-existe"), "");
});
