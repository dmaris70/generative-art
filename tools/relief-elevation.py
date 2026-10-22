# the relief's elevation, 1:1 in mm: python3 tools/relief-elevation.py > projects/045-every-25-token-sketch/relief/elevation.svg
import math
rows=[[1,"5","DAY 1"],[2,"25","DAY 1"],[3,"250","DAY 1"],[4,"2,500","DAY 1"],[5,"28,125","DAY 1"],[6,"328,125","DAY 2"],[7,"3,984,375","DAY 16"],[8,"5.0 x 10^7","DAY 186"],[9,"6.3 x 10^8","YEAR 6"],[10,"8.2 x 10^9","YEAR 80"],[11,"1.1 x 10^11","1.0 x 10^3 YEARS"],[12,"1.4 x 10^12","1.4 x 10^4 YEARS"],[13,"1.9 x 10^13","1.8 x 10^5 YEARS"],[14,"2.6 x 10^14","2.4 x 10^6 YEARS"],[15,"3.5 x 10^15","3.2 x 10^7 YEARS"],[16,"4.7 x 10^16","4.4 x 10^8 YEARS"],[17,"6.5 x 10^17","6.0 x 10^9 YEARS"],[18,"9.0 x 10^18","8.2 x 10^10 YEARS"],[19,"1.2 x 10^20","1.1 x 10^12 YEARS"],[20,"1.7 x 10^21","1.6 x 10^13 YEARS"],[21,"2.4 x 10^22","2.2 x 10^14 YEARS"],[22,"3.4 x 10^23","3.1 x 10^15 YEARS"],[23,"4.8 x 10^24","4.3 x 10^16 YEARS"],[24,"6.7 x 10^25","6.0 x 10^17 YEARS"],[25,"9.5 x 10^26","8.5 x 10^18 YEARS"]]
CUM=[0]+[5,25,250,2500,28125,328125,3984375,4.98e7,6.33e8,8.17e9,1.07e11,1.41e12,1.88e13,2.52e14,3.4e15,4.63e16,6.33e17,8.72e18,1.21e20,1.68e21,2.34e22,3.28e23,4.6e24,6.49e25,9.19e26]
F='font-family="ui-monospace,Menlo,monospace"'
o=[]
T=lambda x,y,t,a='start',s=12,c='#9a9890': o.append(f'<text x="{x}" y="{y}" {F} font-size="{s}" fill="{c}" text-anchor="{a}">{t}</text>')
rect=lambda x,y,w,h,f='#101014',st='#333',sw=2: o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{f}" stroke="{st}" stroke-width="{sw}"/>')
line=lambda x1,y1,x2,y2,c='#c9b797',w=1.5: o.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}"/>')
def dim(x1,y1,x2,y2,t,off=14):
    line(x1,y1,x2,y2)
    if y1==y2: T((x1+x2)/2, y1-6, t, 'middle', 13, '#c9b797')
    else: T(x1+off, (y1+y2)/2+4, t, 'middle', 13, '#c9b797')
o.append('<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1700" viewBox="-100 -100 2200 1700">')
o.append('<rect x="-100" y="-100" width="2200" height="1700" fill="#141418"/>'); rect(0,0,2000,1500,'#0b0b0e','#444')
T(20,-30,'THE RELIEF . A MACHINE READING A LIBRARY . ELEVATION 1:1 IN MM . FOLDED 2 MM STEEL PANEL, BLACK',s=14,c='#e8e6df')
# the conveyor across the top
for i in range(5):
    x,y=80+i*300,80; rect(x-6,y-6,292,292)
    for k in range(1,4): line(x,y+k*70,x+280,y+k*70,'#222',1)
    T(x+140,y+135,'28 x 28 DOTS','middle',11); T(x+140,y+150,'4 MODULES 28 x 7','middle',11)
T(80,58,'THE CONVEYOR . THE LAST FIVE PROGRAMS, ONE A SECOND (ANNOTATION, NOT ENGRAVED)',s=11); dim(80,40,360,40,'280'); dim(360,40,380,40,'20')
# the slow lane at the bottom left
x,y=80,420; rect(x-6,y-6,592,592)
for k in range(1,8): line(x+10,y+10+k*70,x+570,y+10+k*70,'#222',1)
line(x+290,y+10,x+290,y+570,'#222',1); T(x+290,y+295,'58 x 58 DOTS . 580 MM, THE WIDTH OF TWO TILES AND THEIR GAP','middle',11); T(80,1030,'THE SLOW LANE (ANNOTATION)',s=11); dim(60,420,60,1000,'580',-16)
# the counter, the slot, the pocket
rect(712,452,520,46,'#1b1b20')
for i in range(28): rect(720+i*18,460,16,30,'#101014','#2a2a30',1)
T(712,528,'THE PROGRAM . 28 DIGIT WHEELS, 18 MM (ANNOTATION)',s=11); dim(712,442,1232,442,'520')
rect(720,560,120,14,'#1b1b20'); T(860,571,'THE RECEIPT . 58 MM SLOT (ANNOTATION)',s=11)
rect(751,578,58,72,'#e8e6df','#e8e6df',1); rect(747,650,66,22,'#1b1b20','#444',1); T(860,662,'THE POCKET . 64 x 8 x 22 MM, FOLDED 1.5 MM STEEL . ONE TICKET, STANDING, PICTURE UP; A SENSOR IN ITS FLOOR; THE NEXT PRINTS WHEN THIS ONE IS TAKEN (ANNOTATION)',s=11); T(860,678,'A CHUTE BEHIND THE FACE TURNS THE PAPER 60 DEG DOWN FROM THE PRINTER MOUTH TO THE SLOT; FULL CUT (ANNOTATION)',s=11,c='#555'); dim(747,690,813,690,'66'); T(762,718,'TAKE ONE',s=11)
# the list, engraved in the face, aligned right
T(1920,804,'THE LIBRARY . TOKENS . PROGRAMS . BEGINS TO PRINT','end',13)
for i,(n,c,b) in enumerate(rows):
    yy=round(780+66+i*18.2,1); T(1560,yy,str(n),'end'); T(1710,yy,c,'end'); T(1920,yy,b,'end')
T(1920,1316,'SIX OF THESE LINES WILL EVER BE TRUE FOR YOU','end',13)
T(1920,760,'ENGRAVED IN THE FACE, 1 MM DEEP, FILLED WHITE (ANNOTATION)','end',11,'#555')
# the ruler along the foot
o.append('<rect x="80" y="1374" width="1840" height="12" fill="#8a7340"/>')
total=math.log10(CUM[25])
for n in range(1,26):
    xx=80+1840*math.log10(CUM[n])/total; o.append(f'<rect x="{xx-0.75:.1f}" y="1374" width="1.5" height="12" fill="#2a2415"/>'); T(f'{xx:.1f}',1404,str(n),'middle',11)
px=80+1840*math.log10(397)/total; o.append(f'<path d="M{px:.1f},1366 l-6,-12 l12,0 z" fill="#e8e6df"/>')
T(80,1356,'THE LIBRARY . BRASS, ENGRAVED LOG SCALE . POINTER ON A BELT AXIS, 1840 MM TRAVEL: 298 MM ON DAY 1, 473 MM AT A YEAR, 526 AT SIX (ANNOTATION)',s=11); dim(80,1430,1920,1430,'1840')
T(80,1460,'EVERY 25-TOKEN SKETCH . A MACHINE READING A LIBRARY',s=13)
dim(0,1540,2000,1540,'2000'); dim(2040,0,2040,1500,'1500',16)
o.append('</svg>'); print('\n'.join(o))
