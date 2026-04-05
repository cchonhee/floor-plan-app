import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Sparkles,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dimensions, setDimensions] = useState([]);
  const [error, setError] = useState("");
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
      setDimensions([]);
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

    let apiKey = "";
    const modelName = "gemini-2.5-flash";

    try {
      if (
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GEMINI_API_KEY
      ) {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    if (!apiKey || apiKey.trim() === "") {
      setError(
        `🚨 오류: API 키가 설정되지 않았습니다. Vercel 환경 변수를 다시 확인해 주세요.`,
      );
      setIsProcessing(false);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // [핵심 변경] AI에게 복잡한 계산을 빼고 오직 "글자 위치 찾기(OCR)"만 시킵니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. \n\n**1단계:** 도면 내의 모든 개별 방 이름(창고, 화장실, 탈의실, 세면실, 숙직실, 시설관리실, 매점, 탁구장 등)을 빠짐없이 찾아내고 각각의 길이를 계산해.\n\n**2단계 (가장 중요 - 글자 위치 추적):** 수치를 표시할 X, Y 좌표는 선이나 빈 공간이 절대 아니야! 도면에 적혀 있는 **"방 이름 글씨(텍스트) 자체의 정중앙 좌표"**를 OCR(문자 인식)로 스캔해서 백분율(0~100)로 도출해. 위치를 위아래로 이동시키지 말고 오직 글씨가 있는 위치만 정확히 찾아내.`,
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
            text: "너는 도면의 텍스트(글자) 위치를 찾아내는 OCR 전문가야. 방의 테두리나 빈 공간은 완전히 무시하고, 도면에 인쇄된 방 이름 글씨(예: '매점')의 한가운데(Center) X, Y 좌표만 정확하게 추출해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            dimensions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  roomName: {
                    type: "STRING",
                    description: "인식된 방의 이름 (예: 시설관리실)",
                  },
                  widthText: {
                    type: "STRING",
                    description: "가로 길이 (예: W: 3000mm)",
                  },
                  heightText: {
                    type: "STRING",
                    description: "세로 길이 (예: H: 4000mm)",
                  },
                  x: {
                    type: "NUMBER",
                    description: "방 이름 '글씨' 자체의 정중앙 X 좌표 (0-100)",
                  },
                  y: {
                    type: "NUMBER",
                    description: "방 이름 '글씨' 자체의 정중앙 Y 좌표 (0-100)",
                  },
                },
                required: ["roomName", "widthText", "heightText", "x", "y"],
              },
            },
          },
          required: ["dimensions"],
        },
      },
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`상태 코드: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
          const parsedResult = JSON.parse(responseText);
          setDimensions(parsedResult.dimensions || []);
          setIsProcessing(false);
          return;
        } else {
          throw new Error("결과를 찾을 수 없습니다.");
        }
      } catch (err) {
        if (attempt === delays.length) {
          setError(
            "오류가 발생했습니다. 잠시 후 다시 시도해주세요. " + err.message,
          );
          setIsProcessing(false);
          return;
        }
        await sleep(delays[attempt]);
      }
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

      if (dimensions && dimensions.length > 0) {
        const fontSize = Math.max(9, Math.floor(canvas.width * 0.0085));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        dimensions.forEach((dim) => {
          // AI가 찾아낸 '글자'의 중앙 좌표
          const textCenterX = (dim.x / 100) * canvas.width;
          const textCenterY = (dim.y / 100) * canvas.height;

          const wText = dim.widthText || "";
          const hText = dim.heightText || "";

          const wWidth = ctx.measureText(wText).width;
          const hWidth = ctx.measureText(hText).width;
          const maxWidth = Math.max(wWidth, hWidth);

          const paddingX = fontSize * 0.6;
          const boxWidth = maxWidth + paddingX * 2;
          const boxHeight = wText && hText ? fontSize * 2.3 : fontSize * 1.3;

          // [핵심 로직] 우리 코드가 글자 위치(textCenterY)를 기준으로 박스를 그만큼 밑으로 내려서 그립니다.
          // 방 이름표 글씨를 가리지 않도록, 글자 크기(fontSize)의 약 1.5배만큼 아래로 밀어냅니다.
          const yOffset = fontSize * 1.5;
          const boxCenterY = textCenterY + yOffset + boxHeight / 2;

          // 말풍선 박스 그리기
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(
              textCenterX - boxWidth / 2,
              boxCenterY - boxHeight / 2,
              boxWidth,
              boxHeight,
              4,
            );
          } else {
            ctx.rect(
              textCenterX - boxWidth / 2,
              boxCenterY - boxHeight / 2,
              boxWidth,
              boxHeight,
            );
          }
          ctx.fill();

          ctx.lineWidth = 1;
          ctx.strokeStyle = "#4f46e5";
          ctx.stroke();

          // 수치 글씨 그리기 (수정된 boxCenterY 기준)
          ctx.fillStyle = "#1e3a8a";
          if (wText && hText) {
            ctx.fillText(wText, textCenterX, boxCenterY - fontSize * 0.6);
            ctx.fillText(hText, textCenterX, boxCenterY + fontSize * 0.6);
          } else if (wText || hText) {
            ctx.fillText(wText || hText, textCenterX, boxCenterY);
          }
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, dimensions]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_수치완성.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 flex justify-center items-start">
      {/* 1. rounded-[2rem]을 표준 문법인 rounded-3xl로 변경 */}
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[90vh]">
        {/* 2. 에러가 나던 그라데이션 대신, 깔끔하고 세련된 단색(인디고) 배경으로 변경 */}
        <div className="bg-indigo-600 p-6 text-white">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-indigo-200" />
            도면 수치 자동 입력기
          </h1>
          <p className="text-indigo-100 text-sm mt-2 font-medium opacity-90">
            AI가 도면을 읽고 방 크기를 계산해 줍니다.
          </p>
        </div>

        <div className="p-6 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-slate-700 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-3 text-indigo-400 group-hover:text-indigo-600 transition-colors duration-300">
                <Camera className="w-10 h-10" />
                <UploadCloud className="w-10 h-10" />
              </div>
              <span className="text-sm text-slate-500 font-semibold text-center">
                터치하여 사진 촬영
                <br />
                또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              !imageSrc || isProcessing
                ? "bg-slate-300 shadow-none cursor-not-allowed text-slate-500"
                : // 3. 버튼 역시 단색(인디고)으로 통일하고, 마우스를 올렸을 때 더 진해지도록 변경
                  "bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI가 도면을 분석 중입니다...
              </>
            ) : (
              "수치 계산 및 도면에 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1">
            <label className="font-bold text-slate-700 text-lg">
              결과 미리보기
            </label>
            {/* 4. min-h-[250px]를 표준 문법인 min-h-64(256px)로 변경 */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center flex-1 min-h-64">
              {!imageSrc ? (
                <div className="text-slate-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지를 업로드하면 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {dimensions.length > 0 && (
            <button
              onClick={downloadImage}
              className="mt-2 w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors duration-300 shadow-md"
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
