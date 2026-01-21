Shader "Airship/Selection/BoxEdges_PixelStable"
{
    Properties
    {
        _EdgeColor ("Edge Color", Color) = (0.25, 0.95, 1.0, 1.0)
        _FillColor ("Fill Color", Color) = (0.10, 0.35, 0.45, 1.0)

        _EdgeOpacity ("Edge Opacity", Range(0,1)) = 0.95
        _FillOpacity ("Fill Opacity", Range(0,1)) = 0.06

        _EdgeWidthPx ("Edge Width (px)", Range(0.5, 10)) = 2.0

        _PulseStrength ("Pulse Strength", Range(0,1)) = 0.25
        _PulseSpeed ("Pulse Speed", Range(0,10)) = 2.0

        [Toggle] _OnTop ("Render On Top", Float) = 1
    }

    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" }

        Pass
        {
            Name "SelectionBox"
            Tags { "LightMode"="UniversalForward" }

            Blend SrcAlpha OneMinusSrcAlpha
            Cull Off
            ZWrite Off
            ZTest LEqual

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv         : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 positionWS  : TEXCOORD0;
                float2 uv          : TEXCOORD1;
            };

            CBUFFER_START(UnityPerMaterial)
                half4 _EdgeColor;
                half4 _FillColor;
                half  _EdgeOpacity;
                half  _FillOpacity;
                half  _EdgeWidthPx;
                half  _PulseStrength;
                half  _PulseSpeed;
                float _OnTop;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs pos = GetVertexPositionInputs(IN.positionOS.xyz);
                OUT.positionHCS = pos.positionCS;
                OUT.positionWS  = pos.positionWS;
                OUT.uv = IN.uv;

                // Cheap “on top”: push depth slightly forward (works well for gizmos).
                if (_OnTop > 0.5)
                {
                    OUT.positionHCS.z = min(OUT.positionHCS.z, OUT.positionHCS.w * 0.0001);
                }

                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                // Pulse
                float pulse = 0.5 + 0.5 * sin(_Time.y * _PulseSpeed);
                float pulseMul = 1.0 + (pulse - 0.5) * 2.0 * _PulseStrength;

                float2 uv = IN.uv;

                // Distance to nearest UV border (0 at border)
                float2 d2 = min(uv, 1.0 - uv);
                float d = min(d2.x, d2.y);

                // Convert pixel width to UV width using derivatives
                // fwidth(d) ~= how much 'd' changes over 1 pixel on screen
                float fw = fwidth(d);
                float w = fw * _EdgeWidthPx;

                // Anti-aliased edge mask
                float edge = 1.0 - smoothstep(w, w + fw * 1.5, d);

                half3 col = lerp(_FillColor.rgb, _EdgeColor.rgb * pulseMul, edge);
                half  a   = lerp(_FillOpacity, _EdgeOpacity, edge);

                return half4(col, a);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
