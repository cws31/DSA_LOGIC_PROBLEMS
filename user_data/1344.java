class Solution {
    public double angleClock(int hour, int minutes) {
        double res =Math.abs( ((11/2.00*minutes)-30*hour));
        if(res>180) res = 360-res;
        return res;
        
    }
}