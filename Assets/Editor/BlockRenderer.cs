using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using VoxelWorldStuff;

[InitializeOnLoad]
public class BlockRenderer : MonoBehaviour
{
    // Start is called before the first frame update
    void Start()
    {
        
    }

    // Update is called once per frame
    void Update()
    {
        
    }

    [MenuItem("BedWars/Produce Single Block")]
    static void ProduceSingleBlock() {
        var vw = GameObject.Find("VoxelWorld").GetComponent<VoxelWorld>();
        ushort itemId = 5;
        var go = MeshProcessor.ProduceSingleBlock(itemId, vw);
        Selection.objects = new[] { go };
    }

    [MenuItem("BedWars/Generate Block Renders")]
    static void GenerateBlockRenders() {
        var camera = GameObject.Find("Camera").GetComponent<Camera>();
        RenderTexture activeRenderTexture = RenderTexture.active;
        RenderTexture.active = camera.targetTexture;
        var vw = GameObject.Find("VoxelWorld").GetComponent<VoxelWorld>();
        if (vw.loadingStatus == VoxelWorld.LoadingStatus.NotLoading) vw.LoadEmptyWorld();
        var loadedBlocks = vw.voxelBlocks.loadedBlocks;
        ushort itemId = 1;
        for (; itemId < loadedBlocks.Count; itemId++) {
            var loadedBlock = loadedBlocks[itemId];
            if (loadedBlock.definition.contextStyle == VoxelBlocks.ContextStyle.Prefab) continue;

            var strId = loadedBlock.blockTypeId;
            try {
                Debug.Log($"Capturing photo of {strId}");
                var go = MeshProcessor.ProduceSingleBlock(itemId, vw);

                camera.clearFlags = CameraClearFlags.Color;
                camera.Render();
                var w = camera.targetTexture.width;
                var h = camera.targetTexture.height;
                Texture2D image = new Texture2D(w, h);
                image.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                image.Apply();

                byte[] bytes = image.EncodeToPNG();
                DestroyImmediate(image);

                File.WriteAllBytes(Application.dataPath + "/Resources/ItemRenders/" + strId.Split(":")[1] + ".png",
                    bytes);

                DestroyImmediate(go);
            } catch (Exception ex) {
              Debug.Log($"Error capturing render for {strId}: " + ex);  
            }
        }
        RenderTexture.active = activeRenderTexture;
        AssetDatabase.Refresh();
        Debug.Log($"<color=#77f777>Generated {itemId - 1} renders</color>");
    }

    [MenuItem("BedWars/Generate Block Renders", true)]
    static bool ValidateGenerateBlockRenders() {
        return EditorSceneManager.GetActiveScene().name.Equals("BlockPhotobooth");
    }
}
