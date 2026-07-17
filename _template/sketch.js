// Starter sketch. Press S to save a frame.

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(11, 11, 14);
}

function draw() {
  // your art here
}

function keyPressed() {
  if (key === 's' || key === 'S') saveCanvas('frame', 'png');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
