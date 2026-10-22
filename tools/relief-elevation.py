# the relief's elevation, 1:1 in mm, on the 6 × 4 grid
import json, math
rows=[[1,"5","DAY 1"],[2,"25","DAY 1"],[3,"250","DAY 1"],[4,"2,500","DAY 1"],[5,"28,125","DAY 1"],[6,"328,125","DAY 2"],[7,"3,984,375","DAY 16"],[8,"5.0 x 10^7","DAY 186"],[9,"6.3 x 10^8","YEAR 6"],[10,"8.2 x 10^9","YEAR 80"],[11,"1.1 x 10^11","1.0 x 10^3 YEARS"],[12,"1.4 x 10^12","1.4 x 10^4 YEARS"],[13,"1.9 x 10^13","1.8 x 10^5 YEARS"],[14,"2.6 x 10^14","2.4 x 10^6 YEARS"],[15,"3.5 x 10^15","3.2 x 10^7 YEARS"],[16,"4.7 x 10^16","4.4 x 10^8 YEARS"],[17,"6.5 x 10^17","6.0 x 10^9 YEARS"],[18,"9.0 x 10^18","8.2 x 10^10 YEARS"],[19,"1.2 x 10^20","1.1 x 10^12 YEARS"],[20,"1.7 x 10^21","1.6 x 10^13 YEARS"],[21,"2.4 x 10^22","2.2 x 10^14 YEARS"],[22,"3.4 x 10^23","3.1 x 10^15 YEARS"],[23,"4.8 x 10^24","4.3 x 10^16 YEARS"],[24,"6.7 x 10^25","6.0 x 10^17 YEARS"],[25,"9.5 x 10^26","8.5 x 10^18 YEARS"]]
# cumulative counts of programs of 1 … n tokens (from Babel.CUM)
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
o.append('<rect x="-100" y="-100" width="2200" height="1700" fill="#141418"/>')
rect(0,0,2000,1500,'#0b0b0e','#444')
T(20,-30,'THE RELIEF . A MACHINE READING A LIBRARY . ELEVATION 1:1 IN MM . FOLDED 2 MM STEEL PANEL, BLACK . A GRID OF 6 x 4 CELLS OF 280 AT A 300 PITCH',s=14,c='#e8e6df')
G=lambda c,r:(110+c*300,160+r*300)
for c in range(6):
    for r in range(4):
        x,y=G(c,r); o.append(f'<rect x="{x}" y="{y}" width="280" height="280" fill="none" stroke="#2a2a30" stroke-width="1" stroke-dasharray="6 6"/>')
# row 1: the conveyor
for i in range(5):
    x,y=G(i,0); rect(x-6,y-6,292,292); 
    for k in range(1,4): line(x,y+k*70,x+280,y+k*70,'#222',1)
    T(x+140,y+135,'28 x 28 DOTS','middle',11); T(x+140,y+150,'4 MODULES 28 x 7','middle',11)
T(110,138,'THE CONVEYOR . THE LAST FIVE PROGRAMS, ONE A SECOND',s=13)
x,y=G(5,0); T(x+140,y+145,'EMPTY','middle',11,'#555')
dim(110,118,390,118,'280'); dim(390,118,410,118,'20')
# rows 2–3, columns 1–2: the slow lane
x,y=G(0,1); rect(x+2,y+2,576,576)
for k in range(1,8): line(x+10,y+10+k*70,x+570,y+10+k*70,'#222',1)
line(x+290,y+10,x+290,y+570,'#222',1)
T(x+290,y+295,'56 x 56 DOTS . 16 MODULES','middle',11)
T(110,1070,'THE SLOW LANE',s=13); dim(90,460,90,1040,'560',-16)
# row 2, columns 3–4: the counter, the slot, the tray
rect(740,480,520,46,'#1b1b20'); 
for i in range(28): rect(748+i*18,488,16,30,'#101014','#2a2a30',1)
T(748,548,'THE PROGRAM . 28 DIGIT WHEELS, 18 MM . ELECTROMECHANICAL',s=13); dim(740,470,1260,470,'520')
rect(748,590,120,14,'#1b1b20'); T(888,601,'THE RECEIPT . 58 MM SLOT . CUTTING',s=13)
rect(738,635,140,50,'#1b1b20'); T(888,664,'THE TRAY . 140 x 100 x 50 MM . THE TICKET DROPS; WHOEVER IS THERE TAKES IT',s=13); dim(738,697,878,697,'140')
# rows 3–4, columns 5–6: the plate
rect(1320,770,560,560,'#17171b')
T(1340,802,'THE LIBRARY . TOKENS . PROGRAMS . BEGINS TO PRINT',s=13)
for i,(n,c,b) in enumerate(rows):
    yy=round(770+86+i*18.2,1); T(1340,yy,f'{n:2d}'); T(1590,yy,c,'end'); T(1860,yy,b,'end')
T(1340,1308,'SIX OF THESE LINES WILL EVER BE TRUE FOR YOU',s=13)
T(1320,1360,'THE PLATE . ENGRAVED 3 MM STEEL, 560 x 560 . A DOUBLE CELL LIKE THE LANE',s=13)
dim(1320,1350,1880,1350,'560'); dim(1900,770,1900,1330,'560',16)
# row 4, columns 1–4: the ruler
o.append('<rect x="110" y="1194" width="1180" height="12" fill="#8a7340"/>')
total=math.log10(CUM[25])
for n in range(1,26):
    xx=110+1180*math.log10(CUM[n])/total; o.append(f'<rect x="{xx-0.75:.1f}" y="1194" width="1.5" height="12" fill="#2a2415"/>'); T(f'{xx:.1f}',1224,str(n),'middle',11)
T(110,1182,'THE LIBRARY . BRASS, ENGRAVED LOG SCALE . POINTER ON A LEAD SCREW, 1180 MM TRAVEL',s=13); dim(110,1250,1290,1250,'1180')
T(110,1430,'EVERY 25-TOKEN SKETCH . A MACHINE READING A LIBRARY',s=13)
dim(0,1540,2000,1540,'2000'); dim(2040,0,2040,1500,'1500',16)
o.append('</svg>')
open('/home/user/generative-art/projects/045-every-25-token-sketch/relief/elevation.svg','w').write('\n'.join(o)); print('svg written')
