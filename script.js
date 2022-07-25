// this is just for code highlighting in VSCode
// via the glsl-literal extension
const glsl = x => x;

const frag = glsl`
precision highp float;

uniform float width;
uniform float height;
float width_half;

uniform sampler2D camTexture;

const int zoom = 1;
#define SHARPENING 1.0 // Sharpening intensity: Adjusts sharpening intensity by averaging the original pixels to the sharpened result. 1.0 is the unmodified default. 0.0 to 1.0.
#define CONTRAST 1.0 // Adjusts the range the shader adapts to high contrast (0 is not all the way off). Higher values = more high contrast sharpening. 0.0 to 1.0.

void main() {
	width_half = width / 2.0;
	vec2 coord = 1.0 - gl_FragCoord.xy / vec2(width, height);
	vec4 e = texture2D(camTexture, coord);

	if (gl_FragCoord.x > width_half){
		vec2 a_coord =  1.0 - (gl_FragCoord.xy + vec2(-1.0, -1.0)) / vec2(width, height);
		vec4 a_tex = texture2D(camTexture, a_coord);
		vec3 a = a_tex.rgb;
		vec2 b_coord =  1.0 - (gl_FragCoord.xy + vec2( 0.0, -1.0)) / vec2(width, height);
		vec4 b_tex = texture2D(camTexture, b_coord);
		vec3 b = b_tex.rgb;
		vec2 c_coord =  1.0 - (gl_FragCoord.xy + vec2( 1.0, -1.0)) / vec2(width, height);
		vec4 c_tex = texture2D(camTexture, c_coord);
		vec3 c = c_tex.rgb;
		vec2 f_coord =  1.0 - (gl_FragCoord.xy + vec2( 1.0,  0.0)) / vec2(width, height);
		vec4 f_tex = texture2D(camTexture, f_coord);
		vec3 f = f_tex.rgb;
		vec2 g_coord =  1.0 - (gl_FragCoord.xy + vec2(-1.0,  1.0)) / vec2(width, height);
		vec4 g_tex = texture2D(camTexture, g_coord);
		vec3 g = g_tex.rgb;
		vec2 h_coord =  1.0 - (gl_FragCoord.xy + vec2( 0.0,  1.0)) / vec2(width, height);
		vec4 h_tex = texture2D(camTexture, h_coord);
		vec3 h = h_tex.rgb;
		vec2 d_coord =  1.0 - (gl_FragCoord.xy + vec2(-1.0,  0.0)) / vec2(width, height);
		vec4 d_tex = texture2D(camTexture, d_coord);
		vec3 d = d_tex.rgb;
		vec2 i_coord =  1.0 - (gl_FragCoord.xy + vec2( 1.0,  1.0)) / vec2(width, height);
		vec4 i_tex = texture2D(camTexture, i_coord);
		vec3 i = i_tex.rgb;

		// Soft min and max.
		//  a b c			b
		//  d e f * 0.5	+ d e f * 0.5
		//  g h i			h
		// These are 2.0x bigger (factored out the extra multiply).

		vec3 mnRGB = min(min(min(d, e.rgb), min(f, b)), h);
		vec3 mnRGB2 = min(mnRGB, min(min(a, c), min(g, i)));
		mnRGB += mnRGB2;

		vec3 mxRGB = max(max(max(d, e.rgb), max(f, b)), h);
		vec3 mxRGB2 = max(mxRGB, max(max(a, c), max(g, i)));
		mxRGB += mxRGB2;

		// Smooth minimum distance to signal limit divided by smooth max.
		vec3 rcpMRGB = 1.0 / mxRGB;
		vec3 ampRGB = clamp(min(mnRGB, 2.0 - mxRGB) * rcpMRGB, 0.0, 1.0);

		// Shaping amount of sharpening.
		ampRGB = inversesqrt(ampRGB);

		float peak = -3.0 * clamp(CONTRAST, 0.0, 1.0) + 8.0;
		vec3 wRGB = -(1.0 / (ampRGB * peak));

		vec3 rcpWeightRGB = 1.0 / (4.0 * wRGB + 1.0);

		//					0 w 0
		//  Filter shape:	w 1 w
		//					0 w 0
		vec3 window = (b + d) + (f + h);
		vec3 outColor = clamp((window * wRGB + e.rgb) * rcpWeightRGB, 0.0, 1.0);

		gl_FragColor = vec4(mix(e.rgb, outColor, SHARPENING), e.a);
	}
	else gl_FragColor = e;
	
	if (gl_FragCoord.x > width_half - 1.0 && gl_FragCoord.x < width_half + 1.0) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`

const vert = glsl`
precision mediump float;
attribute vec2 position;

void main () {
  gl_Position = vec4(position, 0, 1.0);
}
`

let video = document.querySelector('video');
let fallbackImage = null;

let camTexture = null;

const glea = new GLea({
  glOptions: {
    preserveDrawingBuffer: true
  },
  shaders: [
    GLea.fragmentShader(frag),
    GLea.vertexShader(vert)
  ],
  buffers: {
    'position': GLea.buffer(2, [1, 1, -1, 1, 1, -1, -1, -1])
  }
}).create();

window.addEventListener('resize', () => {
  glea.resize();
});

function loop(time) {
  const { gl } = glea;
  // Upload the image into the texture.
  if (video) {
    glea.setActiveTexture(0, camTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);  
  }
  
  glea.clear();
  glea.uni('width', glea.width);
  glea.uni('height', glea.height);
  glea.uni('time', time * .005);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(loop);
}

function accessWebcam(video) {
  return new Promise((resolve, reject) => {
    const mediaConstraints = { audio: false, video: { width: 1280, height: 720, brightness: {ideal: 2} } };
    navigator.mediaDevices.getUserMedia(mediaConstraints).then(mediaStream => {
      video.srcObject = mediaStream;
      video.setAttribute('playsinline', true);
      video.onloadedmetadata = (e) => {
        video.play();
        resolve(video);
      }
    }).catch(err => {
      reject(err);
    });
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(img);
    };
  });
}

function takeScreenshot() {
  const { canvas } = glea;
  const anchor = document.createElement('a');
  anchor.setAttribute('download', 'selfie.jpg');
  anchor.setAttribute('href', canvas.toDataURL('image/jpeg', 0.92));
  anchor.click();
}

async function setup() {
  const { gl } = glea;
  try {
    await accessWebcam(video);
  } catch (ex) {
    video = null;
    console.error(ex.message);
  }
  // video = null;
  if (! video) {
    try {
      fallbackImage = await loadImage('https://placekitten.com/1280/720')
    } catch (ex) {
      console.error(ex.message);
      return false;
    }
  }

  camTexture = glea.createTexture(0);
  // Upload the image into the texture.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video || fallbackImage);
  
  glea.setActiveTexture(0, camTexture);

  glea.uniI('camTexture', 0);
  loop(0);
}

setup();