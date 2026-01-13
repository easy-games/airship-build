import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Mouse } from "@Easy/Core/Shared/UserInput";
import { AppManager } from "@Easy/Core/Shared/Util/AppManager";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import { ActionId } from "Code/Input/ActionId";
import SoundUtil from "Code/Misc/SoundUtil";
import WorldManager from "Code/World/WorldManager";
import DashboardOnlinePlayer from "./DashboardOnlinePlayer";

export default class Dashboard extends AirshipSingleton {
	public canvas: Canvas;
	public background: Image;
	public window: RectTransform;
	public onlinePlayerPrefab: GameObject;
	public onlinePlayerContent: RectTransform;
	public teleportHomeButton: Button;
	public permissionsButton: Button;
	public onlinePlayersText: TMP_Text;

	public teleportNetSig = new NetworkSignal<[targetPlayerUid: string]>("Dashboard:TeleportToPlayer");
	public teleportHomeNetSig = new NetworkSignal<[]>("Dashboard:TeleportHome");

	private uidToOnlinePlayer = new Map<string, DashboardOnlinePlayer>();

	@NonSerialized() public isOpen = false;

	private openBin = new Bin();

	protected Awake(): void {
		this.canvas.enabled = false;
	}

	override Start(): void {
		if (Game.IsServer()) this.StartServer();
		if (Game.IsClient()) this.StartClient();
	}

	StartServer() {
		this.teleportNetSig.server.OnClientEvent((player, targetUid) => {
			if (!player.character) return;
			const targetPlayer = Airship.Players.FindByUserId(targetUid);
			if (!targetPlayer) return;
			if (!targetPlayer?.character) {
				player.SendMessage(ChatColor.Red("Unable to teleport to " + targetPlayer.username));
				return;
			}
			player.character.Teleport(
				targetPlayer.character.transform.position,
				targetPlayer.character.transform.forward,
			);
			player.SendMessage(ChatColor.Green("Teleported to " + targetPlayer.username));
		});

		this.teleportHomeNetSig.server.OnClientEvent((player) => {
			const world = WorldManager.Get().GetLoadedWorldOwnedByPlayer(player);
			if (world) {
				WorldManager.Get().MovePlayerToLoadedWorld(player, world);
			}
		});

		Airship.Players.ObservePlayers((player) => {
			player.SendMessage(
				"Welcome to " +
					ChatColor.Aqua(ChatColor.Bold("The Build Server")) +
					ChatColor.White("! This is your private world where all progress is saved."),
			);
		});
	}

	StartClient() {
		Airship.Input.OnDown(ActionId.Dashboard).Connect((e) => {
			if (e.uiProcessed) return;

			if (this.isOpen) {
				AppManager.Close();
			} else {
				this.Open();
			}
		});
		Airship.Menu.SetTabListEnabled(false);

		this.onlinePlayerContent.gameObject.ClearChildren();
		Airship.Players.ObservePlayers((player) => {
			if (player.userId === "loading") return;
			const onlinePlayerComp = Instantiate(
				this.onlinePlayerPrefab,
				this.onlinePlayerContent,
			).GetAirshipComponent<DashboardOnlinePlayer>()!;
			onlinePlayerComp.Init(player);

			this.uidToOnlinePlayer.set(player.userId, onlinePlayerComp);

			// Update local player to be last
			this.uidToOnlinePlayer.get(Game.localPlayer.userId)?.transform.SetAsLastSibling();

			this.onlinePlayersText.text = `Online Players (${Airship.Players.GetPlayers().size()})`;

			return () => {
				this.uidToOnlinePlayer.delete(player.userId);
				Destroy(onlinePlayerComp.gameObject);
			};
		});

		this.background.GetComponent<Button>().onClick.Connect(() => {
			AppManager.Close();
		});

		this.teleportHomeButton.onClick.Connect(() => {
			SoundUtil.PlayClick();
			this.teleportHomeNetSig.client.FireServer();
		});

		this.permissionsButton.onClick.Connect(() => {
			SoundUtil.PlayError();
		});
	}

	public Open(): void {
		if (this.isOpen) return;

		AppManager.OpenCustom(() => {
			this.Close();
		});
		this.isOpen = true;
		this.canvas.enabled = true;
		this.background.enabled = true;
		this.background.color = new Color(0, 0, 0, 0);
		NativeTween.GraphicAlpha(this.background, 0.4, 0.18).SetEaseQuadOut();

		this.window.anchoredPosition = new Vector2(480, 0);
		NativeTween.AnchoredPositionX(this.window, -10, 0.18).SetEaseQuadOut();

		this.openBin.Add(Mouse.AddUnlocker());
	}

	private Close(): void {
		this.openBin.Clean();
		this.isOpen = false;
		this.background.enabled = false;
		this.canvas.enabled = false;
	}

	override OnDestroy(): void {}
}
