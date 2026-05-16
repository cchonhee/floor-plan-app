import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Frame,
  Key,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  const [customApiKey, setCustomApiKey] = useState("");
  const canvasRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImageSrc(dataUrl);

      const base64 = dataUrl.split(",")[1];
      setBase64Data(base64);
      setImageMimeType(file.type);
      setAnalysisResult(null);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!base64Data) {
      setError("도면 이미지를 업로드해주세요.");
      return;
    }

    setIsProcessing(true);
    setError("");

    let finalApiKey = customApiKey.trim();

    if (!finalApiKey) {
      try {
        if (
          typeof import.meta !== "undefined" &&
          import.meta.env &&
          import.meta.env.VITE_GEMINI_API_KEY
        ) {
          finalApiKey = import.meta.env.VITE_GEMINI_API_KEY;
        }
      } catch (e) {
        console.warn("환경 변수를 불러오지 못했습니다.", e);
      }
    }

    if (!finalApiKey) {
      setError("API 키가 없습니다. 화면의 입력칸에 구글 API 키를 넣어주세요.");
      setIsProcessing(false);
      return;
    }

    // 💡 [개편] AI가 잘할 수 있는 임무로 프롬프트를 전면 수정했습니다.
    // 선(Line)을 그리기 위한 x1,y1 좌표를 요구하지 않고, 방의 '정중앙 좌표(x,y)'만 요구합니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 이미지 안의 도면을 분석해줘.\n\n**[목표]**\n도면 내에 있는 모든 주요 공간(방, 교실, 화장실 등 명칭이 적혀 있는 구획)을 찾아서, 각 공간의 가로(Width)와 세로(Height) 길이를 수학적으로 추정하고, 해당 공간의 **정중앙 좌표(X, Y 백분율)**를 찾아줘.\n\n각 공간에 대해 다음을 추출해:\n1. roomName: 공간의 이름 (글씨를 읽어서 추출, 예: '음악실', '화장실', '교실1')\n2. widthText: 추정된 가로 길이 (예: 'W: 7.5m')\n3. heightText: 추정된 세로 길이 (예: 'H: 9.0m')\n4. x: 공간 정중앙의 X 좌표 (전체 이미지 너비 대비 백분율, 0~100)\n5. y: 공간 정중앙의 Y 좌표 (전체 이미지 높이 대비 백분율, 0~100)`,
            },
            {
              inlineData: {
                mimeType: imageMimeType || "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: "너는 건축 도면을 분석하는 AI야. 이미지에서 텍스트(방 이름)와 공간의 비율을 인식하여 가로/세로 수치를 추정해. 그리고 반드시 방의 '정중앙(Center)' 위치 좌표를 백분율(0-100)로 반환해. 절대 한 구석으로 좌표를 몰아서 반환하지 마. 응답은 JSON(JavaScript Object Notation, 자바스크립트 객체 표기법) 형식이어야 해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            rooms: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  roomName: { type: "STRING" },
                  widthText: { type: "STRING" },
                  heightText: { type: "STRING" },
                  x: {
                    type: "NUMBER",
                    description: "방 정중앙의 X 백분율 (예: 50)",
                  },
                  y: {
                    type: "NUMBER",
                    description: "방 정중앙의 Y 백분율 (예: 50)",
                  },
                },
                required: ["roomName", "widthText", "heightText", "x", "y"],
              },
            },
          },
          required: ["rooms"],
        },
      },
    };

    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${finalApiKey}`;
      const listRes = await fetch(listUrl);

      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(
          `[상태 코드 ${listRes.status}] 구글 API 서버 접근 거부: ${err.error?.message || "권한 없음"}`,
        );
      }

      const listData = await listRes.json();
      const availableModels = listData.models?.map((m) => m.name) || [];

      let targetModel =
        availableModels.find((m) => m.includes("gemini-1.5-pro")) ||
        availableModels.find((m) => m.includes("gemini-1.5-flash")) ||
        availableModels.find((m) => m.includes("gemini-1.0-pro")) ||
        availableModels.find((m) => m.includes("gemini"));

      if (!targetModel) {
        throw new Error(
          `이 API 키로는 접근 가능한 Gemini 모델이 전혀 없습니다.`,
        );
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${finalApiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `[상태 코드 ${response.status}] 분석 중 서버 오류: ${errorData.error?.message || "알 수 없음"}`,
        );
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (responseText) {
        const parsedResult = JSON.parse(responseText);
        if (parsedResult.rooms && parsedResult.rooms.length > 0) {
          setAnalysisResult(parsedResult);
        }
        setIsProcessing(false);
      } else {
        throw new Error("결과를 찾을 수 없습니다.");
      }
    } catch (err) {
      setError(`🚨 AI 통신 에러: ${err.message}`);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // 💡 [개편] 거미줄처럼 꼬이는 선 그리기 로직을 싹 버리고, 방 중앙에 깔끔한 명찰(박스)을 달아줍니다.
      if (analysisResult && analysisResult.rooms) {
        const fontSize = Math.max(14, Math.floor(canvas.width * 0.015));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        analysisResult.rooms.forEach((room) => {
          if (room.x === undefined || room.y === undefined) return;

          // AI가 찾은 방의 정중앙 좌표
          const pxX = (room.x / 100) * canvas.width;
          const pxY = (room.y / 100) * canvas.height;

          const textLine1 = room.roomName || "공간";
          const textLine2 =
            `${room.widthText || ""} ${room.heightText || ""}`.trim();

          ctx.font = `bold ${fontSize + 4}px sans-serif`;
          const tw1 = ctx.measureText(textLine1).width;
          ctx.font = `bold ${fontSize + 2}px sans-serif`;
          const tw2 = ctx.measureText(textLine2).width;
          const maxTw = Math.max(tw1, tw2) + 30; // 넉넉한 여백
          const boxHeight = fontSize * 3 + 20;

          // 명찰(반투명 박스) 그리기
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.beginPath();
          // 모서리가 둥근 박스
          if (ctx.roundRect) {
            ctx.roundRect(
              pxX - maxTw / 2,
              pxY - boxHeight / 2,
              maxTw,
              boxHeight,
              8,
            );
          } else {
            ctx.rect(pxX - maxTw / 2, pxY - boxHeight / 2, maxTw, boxHeight);
          }
          ctx.fill();
          ctx.strokeStyle = "#3b82f6"; // 산뜻한 파란색 테두리
          ctx.lineWidth = 2;
          ctx.stroke();

          // 텍스트 쓰기
          ctx.fillStyle = "#1e3a8a"; // 방 이름 (남색)
          ctx.font = `bold ${fontSize + 2}px sans-serif`;
          ctx.fillText(textLine1, pxX, pxY - fontSize * 0.7);

          ctx.fillStyle = "#ef4444"; // 치수 수치 (빨간색)
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillText(textLine2, pxX, pxY + fontSize * 0.8);
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, analysisResult]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_수치완성.png";
    link.href = dataUrl;
    link.click();
  };

  const isButtonDisabled = !imageSrc || isProcessing || analysisResult !== null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans p-4 sm:p-8 flex justify-center items-start">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col min-h-[85vh]">
        <div className="px-8 pt-8 pb-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3 text-zinc-900">
            <Frame className="w-6 h-6 text-zinc-900" />
            방별 외곽 벽면 치수 계산기
          </h1>
          <p className="text-zinc-500 text-sm mt-2.5 font-medium leading-relaxed">
            AI가 각 방의 명칭과 중앙 위치를 식별하여 치수를 표시합니다.
          </p>
        </div>

        <div className="px-8 pb-8 pt-4 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-zinc-800 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-400 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-4 text-zinc-400 group-hover:text-zinc-600 transition-colors duration-200">
                <Camera className="w-8 h-8" />
                <UploadCloud className="w-8 h-8" />
              </div>
              <span className="text-sm text-zinc-500 font-medium text-center">
                터치하여 사진 촬영 또는 갤러리에서 선택
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 bg-zinc-50 p-5 rounded-2xl border border-zinc-200">
            <label className="font-bold text-zinc-800 text-sm flex items-center gap-2">
              <Key className="w-4 h-4" /> 디버깅용 API 키 직접 입력 (선택)
            </label>
            <p className="text-xs text-zinc-500">
              여기에 발급받은 새 키를 넣고 돌려보세요. 여기서 작동한다면
              버셀(Vercel) 캐시 문제이고, 여기서도 에러가 난다면 구글 API 키
              자체의 문제입니다.
            </p>
            <input
              type="password"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              placeholder="AIzaSy... 로 시작하는 새 API 키 붙여넣기"
              className="w-full px-4 py-3 bg-white rounded-xl border border-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm shadow-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100 whitespace-pre-line">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
              isButtonDisabled
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-md hover:shadow-lg hover:-translate-y-0.5"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                가장 강력한 AI(Pro)가 방의 구조를 읽어내는 중...
              </>
            ) : analysisResult ? (
              "✅ 계산 완료 (새 도면을 올리면 다시 활성화됩니다)"
            ) : (
              "2. 각 방별 외곽 벽면 길이 계산 및 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1 mt-2">
            <h2 className="text-sm font-bold text-zinc-800 tracking-wide">
              결과 미리보기
            </h2>
            <div className="bg-zinc-50/80 rounded-2xl border border-zinc-200 overflow-hidden flex items-center justify-center flex-1 min-h-[300px]">
              {!imageSrc ? (
                <div className="text-zinc-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지가 여기에 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm border border-zinc-100"
                  />
                </div>
              )}
            </div>
          </div>

          {analysisResult && (
            <button
              onClick={downloadImage}
              className="mt-1 w-full py-3.5 rounded-xl font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center gap-2 transition-all duration-200"
            >
              <Download className="w-5 h-5" />
              결과 이미지 갤러리에 저장하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
