package io.github.absurdunicorn.sbhlink;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemLore;
import net.minecraft.world.scores.DisplaySlot;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.PlayerScoreEntry;
import net.minecraft.world.scores.PlayerTeam;
import net.minecraft.world.scores.Scoreboard;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SkyBlock Helper Link.
 *
 * Writes down things your game already shows you on Hypixel SkyBlock, as lines of text in a file on your PC
 * (%APPDATA%/SkyBlock Helper Link/events.jsonl), which the SkyBlock Helper app reads:
 *   - your own system messages: Bazaar orders, shard catches, fusions, charms, syphons, rare drops, slayer quests,
 *     sea creature catches, Loot Share shards, and the end-of-run summary of dungeons and Kuudra
 *   - skill XP gains shown in the action bar
 *   - your area and purse from the sidebar
 *   - your Bazaar orders while you have the "Bazaar Orders" menu open yourself
 *
 * What it never does, by design (Hypixel forbids automation and changing how the client talks to the server):
 * it sends nothing to any server and uses no network at all, never types chat or commands, never clicks, opens or
 * closes anything, changes no packets or game behaviour, and draws nothing in game. Player chat (messages, party,
 * guild, all chat) is never recorded, and other players' names are cut from the few system lines that contain them.
 */
public class SbhLinkClient implements ClientModInitializer {
	// single-line system messages to keep (plain text, formatting removed)
	private static final Pattern KEEP = Pattern.compile(
		"^(\\[Bazaar\\] "
		+ "|You caught (a|an|x?\\d[\\d,]*x?) .+!"                      // shards ("x2 Solar Shards") and sea creatures
		+ "|It's a Double Hook!"
		+ "|FUSION! You obtained "
		+ "|CHARM! You charmed "
		+ "|You used Syphon on "
		+ "|(RARE|VERY RARE|CRAZY RARE|INSANE|PRAY TO RNGESUS) DROP! "
		+ "|HIVE! You found "
		+ "|SLAYER QUEST (STARTED|COMPLETE|FAILED)!"
		+ "|SLAYER BOSS! The .+ spawned!"
		+ "|NICE! SLAYER BOSS SLAIN!"
		+ "|LOOT SHARE You received an? .+ Shards? for assisting"
		+ "|KUUDRA DOWN!)");
	// skill XP in the action bar: "+12.5 Combat (45.2%)" or "+12.5 Combat (1,234/5,000)"
	private static final Pattern SKILL = Pattern.compile("\\+([\\d,.]+) (Farming|Mining|Combat|Foraging|Fishing|Enchanting|Alchemy|Taming|Carpentry|Runecrafting|Social|Hunting) \\(([^)]*)\\)");
	private static final long MAX_BYTES = 5L * 1024 * 1024;   // then the file is rotated to events.1.jsonl

	private final ExecutorService writer = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "SkyBlock Helper Link writer");
		t.setDaemon(true);
		return t;
	});
	private Path file;
	private String lastSkill = "", lastArea = "", lastPurse = "", lastOrders = "";
	private long lastPurseAt = 0;
	private int ticks = 0;

	@Override
	public void onInitializeClient() {
		file = folder().resolve("events.jsonl");
		ClientReceiveMessageEvents.GAME.register(this::onGameMessage);
		ClientTickEvents.END_CLIENT_TICK.register(this::onTick);
	}

	// ---------- chat and action bar ----------
	private void onGameMessage(Component message, boolean overlay) {
		if (!onHypixel()) return;
		String raw = message.getString().replaceAll("§.", "");
		if (overlay) { skillXp(raw); return; }
		String text = raw.strip();
		if (text.isEmpty()) return;
		if (text.contains("\n")) { summary(text); return; }
		if (!KEEP.matcher(text).find()) return;
		int cut = text.indexOf(" for assisting");   // Loot Share: drop the other player's name
		if (text.startsWith("LOOT SHARE") && cut > 0) text = text.substring(0, cut);
		write(text);
	}

	private void skillXp(String bar) {
		Matcher m = SKILL.matcher(bar);
		if (!m.find()) return;
		String s = "+" + m.group(1) + " " + m.group(2) + " (" + m.group(3) + ")";
		if (s.equals(lastSkill)) return;   // the action bar repeats the same gain for a few seconds
		lastSkill = s;
		write("[Skill] " + s);
	}

	// multi-line end-of-run summaries: keep only the floor, the time and the score (the lines with names are left out)
	private void summary(String text) {
		boolean dungeon = text.contains("The Catacombs - ") || text.contains("Master Mode Catacombs - ");
		boolean kuudra = text.contains("KUUDRA DOWN") || text.contains("Kuudra's Hollow");
		if (!dungeon && !kuudra) return;
		List<String> keep = new ArrayList<>();
		for (String line : text.split("\n")) {
			String l = line.strip();
			if (l.startsWith("The Catacombs - ") || l.startsWith("Master Mode Catacombs - ") || l.startsWith("Defeated ")
				|| l.startsWith("Score: ") || l.startsWith("KUUDRA DOWN") || l.contains("Tier") || l.startsWith("Kuudra's Hollow"))
				keep.add(l.replaceAll("\\s{2,}", " "));
		}
		if (!keep.isEmpty()) write((dungeon ? "[Dungeon] " : "[Kuudra] ") + String.join(" | ", keep));
	}

	// ---------- sidebar and the Bazaar Orders menu (checked once a second, written only when they change) ----------
	private void onTick(Minecraft mc) {
		if (++ticks % 20 != 0 || mc.level == null || !onHypixel()) return;
		try { sidebar(mc); } catch (RuntimeException ignored) { }
		try { ordersMenu(mc); } catch (RuntimeException ignored) { }
	}

	private void sidebar(Minecraft mc) {
		Scoreboard sb = mc.level.getScoreboard();
		Objective obj = sb.getDisplayObjective(DisplaySlot.SIDEBAR);
		if (obj == null || !obj.getDisplayName().getString().replaceAll("§.", "").toUpperCase().contains("SKYBLOCK")) return;
		String area = "", purse = "";
		for (PlayerScoreEntry e : sb.listPlayerScores(obj)) {
			if (e.isHidden()) continue;
			PlayerTeam team = sb.getPlayersTeam(e.owner());
			Component shown = e.display() != null ? e.display() : PlayerTeam.formatNameForTeam(team, Component.literal(e.owner()));
			String line = shown.getString().replaceAll("§.", "").replaceAll("[^\\x20-\\x7E⏣ф]", "").strip();
			if (line.startsWith("⏣") || line.startsWith("ф")) area = line.substring(1).strip();   // ⏣ area, ф (the Rift)
			else if (line.startsWith("Purse: ") || line.startsWith("Piggy: ")) purse = line.substring(7).split(" ")[0];
		}
		if (!area.isEmpty() && !area.equals(lastArea)) { lastArea = area; write("[Area] " + area); }
		long now = System.currentTimeMillis();
		if (!purse.isEmpty() && !purse.equals(lastPurse) && now - lastPurseAt > 30_000) { lastPurse = purse; lastPurseAt = now; write("[Purse] " + purse); }
	}

	private void ordersMenu(Minecraft mc) {
		if (!(mc.gui.screen() instanceof AbstractContainerScreen<?> screen)) { lastOrders = ""; return; }   // the menu you have open, if any
		String title = screen.getTitle().getString().replaceAll("§.", "");
		if (!title.contains("Bazaar Orders")) return;
		List<String> orders = new ArrayList<>();
		for (Slot slot : screen.getMenu().slots) {
			if (slot.container instanceof Inventory) continue;   // your own inventory isn't part of the menu
			ItemStack stack = slot.getItem();
			if (stack.isEmpty()) continue;
			String name = stack.getHoverName().getString().replaceAll("§.", "").strip();
			if (!name.startsWith("BUY ") && !name.startsWith("SELL ")) continue;
			StringBuilder b = new StringBuilder(name);
			ItemLore lore = stack.get(DataComponents.LORE);
			if (lore != null) for (Component c : lore.lines()) {
				String l = c.getString().replaceAll("§.", "").strip();
				// order details only; lines listing other players (who filled it) are left out
				if (l.matches("^(Order amount|Offer amount|Filled|Price per unit|Expires|Worth|You have|Expired).*")) b.append(" ; ").append(l);
			}
			orders.add(b.toString());
		}
		String all = String.join(" || ", orders);
		if (all.equals(lastOrders)) return;
		lastOrders = all;
		write("[Orders] " + (orders.isEmpty() ? "none" : all));
	}

	// ---------- writing ----------
	private void write(String text) {
		String line = "{\"t\":" + System.currentTimeMillis() + ",\"m\":\"" + json(text) + "\"}\n";
		writer.execute(() -> append(line));   // file writes stay off the game's render thread
	}

	private static boolean onHypixel() {
		ServerData server = Minecraft.getInstance().getCurrentServer();
		return server != null && server.ip != null && server.ip.toLowerCase().contains("hypixel.net");
	}

	private void append(String line) {
		try {
			Files.createDirectories(file.getParent());
			if (Files.exists(file) && Files.size(file) > MAX_BYTES)
				Files.move(file, file.resolveSibling("events.1.jsonl"), StandardCopyOption.REPLACE_EXISTING);
			Files.writeString(file, line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
		} catch (IOException ignored) {
			// never let a disk problem affect the game
		}
	}

	private static Path folder() {
		String appData = System.getenv("APPDATA");
		Path base = appData != null && !appData.isBlank() ? Paths.get(appData) : Paths.get(System.getProperty("user.home"), ".config");
		return base.resolve("SkyBlock Helper Link");
	}

	private static String json(String s) {
		StringBuilder b = new StringBuilder(s.length() + 8);
		for (char c : s.toCharArray()) {
			switch (c) {
				case '"' -> b.append("\\\"");
				case '\\' -> b.append("\\\\");
				case '\n' -> b.append("\\n");
				case '\r' -> b.append("\\r");
				case '\t' -> b.append("\\t");
				default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
			}
		}
		return b.toString();
	}
}
