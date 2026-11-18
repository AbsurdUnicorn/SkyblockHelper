# SkyBlock Helper Link (Fabric, Minecraft 26.2)

A small client-only mod that lets the SkyBlock Helper app see your own SkyBlock results, so its plans can use your
real numbers instead of guesses.

## What it records

Only things your game already shows you, and only on Hypixel. Each one becomes a line of text with the time in
`%APPDATA%\SkyBlock Helper Link\events.jsonl`, which the app reads:

- **Your own system messages:** Bazaar orders (set up, filled, claimed, cancelled, refunded), shard catches, fusions,
  charms, syphons, rare drops, slayer quests (started, boss spawned, slain, complete), sea creature catches and
  Double Hooks, Loot Share shards, and the end-of-run summary of dungeons and Kuudra (floor, time and score only).
- **Skill XP gains** shown in the action bar (for example `+12.5 Combat (45.2%)`), once per gain.
- **Your area and purse** from the sidebar, when they change (purse at most every 30 seconds).
- **Your Bazaar orders,** while you have the "Bazaar Orders" menu open yourself: each order's item, amount, how much
  has filled and its price.

Player chat (private messages, party, guild, all chat) is never recorded: only lines that start exactly like the
system messages above match. Other players' names are cut out of the few system lines that contain them (Loot
Share, run summaries), and the lines of the orders menu that list who filled an order are left out.

## What it never does

Hypixel forbids anything that automates gameplay or changes how your client communicates with the server, and
treats anything outside its allowed categories as disallowed. So by design this mod:

- sends nothing to Hypixel or any other server, and uses no network at all
- never types chat or commands, clicks, opens or closes menus, or presses keys
- uses no mixins and changes no packets or game behaviour
- draws nothing in game and adds no information to your screen (all numbers are shown in the app)

Hypixel never approves specific mods and all mods are used at your own risk; this one is kept to the smallest, most
passive thing that works.

## Build

Needs a Java 25 runtime to run Gradle (the Modrinth app ships one); Gradle downloads a Java 25 JDK for compiling.

```
gradlew build
```

The mod is `build/libs/skyblock-helper-link-1.0.0.jar`. Put it in your Fabric 26.2 profile's `mods` folder
together with Fabric API.
