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
import PermissionsPage from "./Permissions/PermissionsPage";

export default class Dashboard extends AirshipSingleton {
	public canvas: Canvas;
	public background: Image;
	public window: RectTransform;
	public onlinePlayerPrefab: GameObject;
	public onlinePlayerContent: RectTransform;
	public teleportHomeButton: Button;
	public permissionsButton: Button;
	public onlinePlayersText: TMP_Text;
	public permissionsPage: PermissionsPage;

	public teleportNetSig = new NetworkSignal<[targetPlayerUid: string]>("Dashboard:TeleportToPlayer");
	public teleportHomeNetSig = new NetworkSignal<[]>("Dashboard:TeleportHome");
	public setBuildPermissionNetSig = new NetworkSignal<[uid: string, hasPermission: boolean]>(
		"Dashboard:SetBuildPermission",
	);

	private uidToOnlinePlayer = new Map<string, DashboardOnlinePlayer>();

	@NonSerialized() public isOpen = false;

	private openBin = new Bin();

	protected Awake(): void {
		this.canvas.enabled = false;
		this.permissionsPage.gameObject.SetActive(false);
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

			const targetWorld = WorldManager.Get().GetCurrentLoadedWorldFromPlayer(targetPlayer);
			if (!targetWorld) {
				player.SendMessage(ChatColor.Red(targetPlayer.username + " is not in a world."));
				return;
			}
			WorldManager.Get().MovePlayerToLoadedWorld(player, targetWorld, {
				targetLocation: {
					position: targetPlayer.character.transform.position,
					forward: targetPlayer.character.transform.forward,
				},
			});
		});

		this.teleportHomeNetSig.server.OnClientEvent((player) => {
			const world = WorldManager.Get().GetLoadedWorldOwnedByPlayer(player);
			if (world) {
				WorldManager.Get().MovePlayerToLoadedWorld(player, world);
			}
		});

		this.setBuildPermissionNetSig.server.OnClientEvent((player, uid, hasPermission) => {
			const world = WorldManager.Get().GetLoadedWorldOwnedByPlayer(player);
			if (!world) return;

			world.SetBuildPermission(uid, hasPermission);
			WorldManager.Get().buildPermissionChangedNetSig.server.FireAllClients(
				uid,
				world.networkIdentity.netId,
				hasPermission,
			);
		});

		Airship.Players.ObservePlayers((player) => {
			if (player.IsBot()) return;
			player.SendMessage(
				"Welcome to " +
					ChatColor.Aqua(ChatColor.Bold("The Build Server")) +
					ChatColor.White(
						"! This is your private world where all progress is saved. Reset world by typing " +
							ChatColor.Yellow("/delworld") +
							". Double jump to fly!",
					),
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

		const UpdatePlayerCountText = () => {
			this.onlinePlayersText.text = `Online Players (${Airship.Players.GetPlayers().size()})`;
		};

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

			UpdatePlayerCountText();

			return () => {
				this.uidToOnlinePlayer.delete(player.userId);
				Destroy(onlinePlayerComp.gameObject);
				UpdatePlayerCountText();
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
			SoundUtil.PlayClick();
			this.OpenPermissionPage();
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

	public OpenPermissionPage(): void {
		if (!this.isOpen) {
			this.Open();
		}
		this.permissionsPage.gameObject.SetActive(true);
		const rect = this.permissionsPage.transform as RectTransform;
		rect.anchoredPosition = new Vector2(600, 0);
		NativeTween.AnchoredPositionX(rect, 0, 0.18).SetEaseQuadOut();

		AppManager.OpenCustom(
			() => {
				NativeTween.AnchoredPositionX(rect, 600, 0.18).SetEaseQuadIn();
			},
			{
				addToStack: true,
			},
		);
	}

	private Close(): void {
		this.openBin.Clean();
		this.isOpen = false;
		this.background.enabled = false;
		this.canvas.enabled = false;
	}

	override OnDestroy(): void {}
}
