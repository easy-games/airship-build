import { Airship } from "@Easy/Core/Shared/Airship";
import { AudioManager } from "@Easy/Core/Shared/Audio/AudioManager";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { CanvasAPI, HoverState } from "@Easy/Core/Shared/Util/CanvasAPI";
import { ColorUtil } from "@Easy/Core/Shared/Util/ColorUtil";
import Dashboard from "./Dashboard";

export default class DashboardOnlinePlayer extends AirshipBehaviour {
	public avatarImg: RawImage;
	public usernameText: TMP_Text;
	public arrowImg: Image;
	public button: Button;
	public bg: Image;

	@NonSerialized() public player: Player;

	private bin = new Bin();

	public Init(player: Player): void {
		this.player = player;
		task.spawn(async () => {
			const tex = await Airship.Players.GetProfilePictureAsync(player.userId);
			this.avatarImg.texture = tex;
		});
		this.usernameText.text = player.username;

		if (player.IsLocalPlayer()) {
			this.usernameText.color = ColorUtil.HexToColor("6E7380");
			this.arrowImg.gameObject.SetActive(false);
		}
	}

	override Start(): void {
		this.bin.Add(
			this.button.onClick.Connect(() => {
				AudioManager.PlayGlobal("Assets/AirshipPackages/@Easy/Core/Sound/UI_Select.wav");
				Dashboard.Get().teleportNetSig.client.FireServer(this.player.userId);
			}),
		);
		if (!this.player.IsLocalPlayer()) {
			this.bin.AddEngineEventConnection(
				CanvasAPI.OnHoverEvent(this.gameObject, (hov) => {
					this.bg.gameObject.SetActive(hov === HoverState.ENTER);
					if (hov === HoverState.ENTER) {
						AudioManager.PlayGlobal("Assets/AirshipPackages/@Easy/Core/Sound/UI_Notch.wav", {
							// volumeScale: 0.2,
						});
					}
				}),
			);
			if (CanvasAPI.IsPointerOverTarget(this.gameObject)) {
				this.bg.gameObject.SetActive(true);
			}
		}
	}

	override OnDestroy(): void {
		this.bin.Clean();
	}
}
